<!-- Source: https://hackjunction.app/participate/45/challenges/307 -->

# Wikipedia Through Time.

by MariaDB

## The Challenge

## Build the tools Wikipedia is missing, powered by MariaDB's vector search (RAG) and system-versioned tables.

### INTRODUCTION

Every time you open a Wikipedia article, MariaDB is working behind the scenes: it is the open-source database that stores and serves the world's largest encyclopedia. Yet much of Wikipedia's potential remains untapped. Search is still largely keyword-based, and the full edit history behind every article, a record of how human knowledge evolves, is rarely explored. AI and modern database features now make it possible to ask Wikipedia questions in plain language and to travel back in time through its content. MariaDB is bringing this challenge to Junction to see what the next generation of builders can create when these capabilities meet real Wikipedia data.

### CHALLENGE DESCRIPTION

Your mission: build a tool for Wikipedia that doesn't exist yet, or that exists but is badly underused, with MariaDB at the core of your stack. The challenge has two tracks, and you pick the one that matches your ambition.

#### RAG TRACK (recommended for most teams)

use MariaDB's native vector search to build retrieval-augmented generation (RAG) **functionality** that let people ask questions of Wikipedia and get grounded, source-cited answers, for example a research assistant for the history of Finland.

#### SVT TRACK (for advanced teams)

use MariaDB system-versioned tables (SVT) to build tools that query how knowledge changes over time, for example showing what an article said on any given date, surfacing edit wars, or tracing how the story of a historical event has been rewritten.

#### BOTH (for very advanced teams)

combine the two, for example a RAG assistant that can answer “what did Wikipedia say about this in 2015, and what has changed since?”

### JUDGING CRITERIA

We're looking for the most useful and original tool for Wikipedia built on MariaDB. Judges will focus on effective and creative use of MariaDB RAG and/or system-versioned tables, technical execution and scalability across the provided datasets, real-world usefulness for Wikipedia readers or editors, and design and demo quality. Teams taking on the SVT track, or combining both tracks, will be recognised for the added technical ambition.

### PRIZES

1st place — €1,000 in cash, €1,000 in UpCloud credits, and a MariaDB certification for every team member (5 vouchers at [learn.mariadb.com](https://hackjunction.app/learn.mariadb.com), value 750 USD).

2nd place — €500 in cash.

3rd place — €250 in cash.

All winning teams to be credited in blog on [mariadb.org](https://hackjunction.app/mariadb.org).

## Insight

### INSIGHTS AND FOCUS AREAS

LLMs in general have a particular world view based on their training data – and it may differ from Wikipedia’s world view, which strives for NPOV (Neutral Point of View).

There are two different user groups and perspectives: Wikipedia readers, or active Wikipedians that edit articles. You may choose either, or both.

We'd love to see tools that make Wikipedia's knowledge easier to digest, verify and trust, such as source-grounded Q&A, fact-checking assistants, or detecting gaps and weak spots in article coverage. Comparing the same article between languages can reveal surprising insights, too. On the SVT side, we're especially excited by “time-travel” tools that reveal how articles evolve: point-in-time views, change visualisations, edit wars or bias detection, and edit-history analytics.

### EXTRA DETAILS

MariaDB was born in Finland, created by Michael “Monty” Widenius, the original author of MySQL, which makes Junction a natural home for this challenge. The source articles are in Finnish, so a multilingual embedding model is recommended for the RAG track, but no Finnish language skills are needed to compete. We offer three datasets of various sizes and characteristics.

## Resources

### WHAT WE'LL BRING

During the event, participants will build on MariaDB, the open-source database powering Wikipedia, using real Wikipedia data prepared especially for this challenge. We're providing preliminary datasets in three sizes (small, medium and large) drawn from Finnish Wikipedia articles on the history of Finland, so teams can prototype fast and then prove their tool scales. List of technologies and support we are bringing: – MariaDB Server (open source) with native vector search for the RAG track – MariaDB system-versioned tables for the SVT track – Small, medium and large Wikipedia datasets (Finnish Wikipedia, history of Finland) – Starter documentation and example – MariaDB mentors on site throughout the hackathon Teams are free to pair MariaDB with any LLM, embedding model or frontend framework of their choice.

### STARTER DOCUMENTATION AND EXAMPLES

- [https://github.com/MariaDB/mariadb-wikipedia-datasets](https://github.com/MariaDB/mariadb-wikipedia-datasets)
- [https://github.com/MariaDB/mariadb-vector-wikipedia-rag](https://github.com/MariaDB/mariadb-vector-wikipedia-rag)
- [https://github.com/MariaDB/mariadb-system-versioning-wikipedia](https://github.com/MariaDB/mariadb-vector-wikipedia-rag)

### MENTORS

Mentors from MariaDB with hands-on expertise in MariaDB Vector and RAG pipelines, system-versioned (temporal) tables, and working with large-scale Wikipedia data. They will be available throughout the hackathon to help teams with data modelling, query design and scaling.

- Kaj Arnö, MariaDB Foundation, Executive Chairman
- Robert Silén, MariaDB Foundation, AI Lead

Company Info

## MariaDB

Website: [https://mariadb.org/](https://mariadb.org/)

## Judging Criteria

- Effective and Creative use of MariaDB(20%)
Effective and creative use of MariaDB RAG and/or system-versioned tables
- Implementation(20%)
Technical execution and scalability across the provided datasets
- Usefulness(20%)
Real-world usefulness for Wikipedia readers or editors
- Design and demo quality(20%)
Design and demo quality
- Originality(20%)
The most original and unique implementation of the project
- Bonus(0%)
Added technical ambition for teams taking on the SVT track or combining both tracks

## Prizes

- 1st Place
€1,000 in cash, €1,000 in UpCloud credits, and a MariaDB certification for every team member (5 vouchers at learn.mariadb.com, value 750 USD).
- 2nd Place
€500 in cash.
- 3rd Place
€250 in cash.
- All Winners
All winning teams to be credited in blog on mariadb.org.
