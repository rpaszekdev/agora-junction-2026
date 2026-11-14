"""Background removal on Modal: image in, transparent PNG out.

deploy:  modal deploy cutout_app.py
bench:   modal run cutout_app.py --src <dir of images> --out <dir>
"""
import io
import time

import modal

GPU = "L40S"  # ponytail: one GPU type; "L4" is ~2.5x cheaper if ms matter less
MODELS = ["ZhengPeng7/BiRefNet_lite", "ZhengPeng7/BiRefNet_lite-matting", "PramaLLC/BEN2"]
DEFAULT = MODELS[0]
MAX_BYTES = 15_000_000

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1", "transformers==4.47.1",
        "timm", "kornia", "einops", "pillow", "requests", "fastapi[standard]",
        "git+https://github.com/PramaLLC/BEN2.git",
    )
    .env({"HF_HOME": "/cache"})
)
app = modal.App("cutout", image=image)
cache = modal.Volume.from_name("hf-cache", create_if_missing=True)


# ponytail: max_containers=1 caps spend on a public endpoint; raise for the demo crowd
@app.cls(gpu=GPU, volumes={"/cache": cache}, scaledown_window=120, max_containers=1)
class Cutter:
    @modal.enter()
    def load(self):
        import torch
        from ben2 import BEN_Base
        from PIL import Image
        from torchvision import transforms
        from transformers import AutoModelForImageSegmentation

        self.torch = torch
        self.prep = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        self.models = {
            m: AutoModelForImageSegmentation.from_pretrained(m, trust_remote_code=True).cuda().eval().half()
            for m in MODELS if "BiRefNet" in m
        }
        self.models["PramaLLC/BEN2"] = BEN_Base.from_pretrained("PramaLLC/BEN2").cuda().eval()
        cache.commit()
        buf = io.BytesIO()
        Image.new("RGB", (640, 480), "white").save(buf, "PNG")
        for m in self.models:  # warm-up so the first real call isn't slow
            self._cut(buf.getvalue(), m)

    def _cut(self, data: bytes, model: str) -> tuple[bytes, float]:
        from PIL import Image
        from torchvision.transforms.functional import to_pil_image

        img = Image.open(io.BytesIO(data)).convert("RGB")
        t = time.perf_counter()
        if model == "PramaLLC/BEN2":
            out = self.models[model].inference(img, refine_foreground=False)
        else:
            x = self.prep(img).unsqueeze(0).cuda().half()
            with self.torch.no_grad():
                alpha = self.models[model](x)[-1].sigmoid()[0, 0].float().cpu()
            out = img.copy()
            out.putalpha(to_pil_image(alpha).resize(img.size, Image.BILINEAR))
        ms = (time.perf_counter() - t) * 1000
        buf = io.BytesIO()
        out.save(buf, "PNG", compress_level=1)
        return buf.getvalue(), ms

    @modal.method()
    def cut(self, data: bytes, model: str = DEFAULT) -> tuple[bytes, float]:
        return self._cut(data, model)

    @modal.fastapi_endpoint(method="POST")
    def api(self, body: dict):
        """POST {"url": "https://...", "model": optional} -> image/png"""
        import requests
        from fastapi import HTTPException, Response

        url, model = str(body.get("url", "")), str(body.get("model", DEFAULT))
        if not url.startswith(("https://", "http://")):
            raise HTTPException(400, "body needs an http(s) 'url'")
        if model not in self.models:
            raise HTTPException(400, f"model must be one of {list(self.models)}")
        try:
            r = requests.get(url, timeout=15, stream=True)
            r.raise_for_status()
            data = r.raw.read(MAX_BYTES + 1, decode_content=True)
        except requests.RequestException as e:
            raise HTTPException(502, f"could not fetch image: {e}") from e
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "image larger than 15 MB")
        try:
            png, ms = self._cut(data, model)
        except Exception as e:  # bad/unsupported image bytes
            raise HTTPException(422, f"could not process image: {e}") from e
        return Response(png, media_type="image/png", headers={"X-Model-Ms": f"{ms:.1f}"})


@app.local_entrypoint()
def bench(src: str, out: str):
    import pathlib
    import statistics

    files = sorted(p for p in pathlib.Path(src).iterdir() if p.is_file())
    cutter = Cutter()
    for m in MODELS:
        d = pathlib.Path(out, m.split("/")[1])
        d.mkdir(parents=True, exist_ok=True)
        times = []
        for f in files:
            png, ms = cutter.cut.remote(f.read_bytes(), m)
            (d / f"{f.stem}.png").write_bytes(png)
            times.append(ms)
        print(f"{m:36s} median {statistics.median(times):6.1f} ms   max {max(times):6.1f} ms   n={len(times)}")
