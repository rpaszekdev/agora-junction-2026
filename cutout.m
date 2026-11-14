// Cuts the main object out of a photo with macOS Vision (the same "lift subject" as Photos).
// Usage: cutout <photo> <out.png>   Exit 0 = PNG written, cropped to the object. Exit 2 = no object found.
// Build: clang -fobjc-arc -O2 cutout.m -framework Foundation -framework Vision -framework CoreImage -framework CoreVideo -framework CoreGraphics -o .cutout-bin
// The class is looked up by name because the Command Line Tools SDK (13.3) predates this macOS 14 API.
#import <CoreImage/CoreImage.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

@interface NSObject (SubjectLifting)
- (NSIndexSet *)allInstances;
- (CVPixelBufferRef)generateMaskedImageOfInstances:(NSIndexSet *)instances
                                fromRequestHandler:(VNImageRequestHandler *)handler
                           croppedToInstancesExtent:(BOOL)crop
                                             error:(NSError **)error;
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) { fprintf(stderr, "usage: cutout <photo> <out.png>\n"); return 1; }
        CIImage *photo = [CIImage imageWithContentsOfURL:[NSURL fileURLWithPath:@(argv[1])]];
        Class Lift = NSClassFromString(@"VNGenerateForegroundInstanceMaskRequest");
        if (!photo || !Lift) { fprintf(stderr, "%s\n", photo ? "needs macOS 14 or newer" : "not a readable image"); return 1; }
        NSError *error = nil;
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCIImage:photo options:@{}];
        VNRequest *request = [[Lift alloc] init];
        if (![handler performRequests:@[request] error:&error]) { fprintf(stderr, "%s\n", error.description.UTF8String); return 1; }
        id found = request.results.firstObject;
        if (!found || [found allInstances].count == 0) return 2;
        CVPixelBufferRef pixels = [found generateMaskedImageOfInstances:[found allInstances] fromRequestHandler:handler
                                               croppedToInstancesExtent:YES error:&error];
        if (!pixels) { fprintf(stderr, "%s\n", error.description.UTF8String); return 1; }
        CGColorSpaceRef srgb = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        BOOL ok = [[CIContext context] writePNGRepresentationOfImage:[CIImage imageWithCVPixelBuffer:pixels]
                                                               toURL:[NSURL fileURLWithPath:@(argv[2])]
                                                              format:kCIFormatRGBA8 colorSpace:srgb options:@{} error:&error];
        if (!ok) { fprintf(stderr, "%s\n", error.description.UTF8String); return 1; }
    }
    return 0;
}
