# Synapse Optimization Baseline (2026-03-28)

## Progress

- [x] 已完成代码与架构审查
- [x] 已确认 chorus-research 具备远端测量条件
- [x] 已完成默认账号登录与 cookie 复用验证
- [x] 已完成第一轮真实接口耗时采样
- [x] 已完成第一轮 SQL EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
- [ ] 待基于这份基线落地 project-metrics 统一读模型
- [ ] 待批量化通知解析
- [ ] 待拆出 GPU telemetry worker
- [ ] 待拆 experiment-run.service 和 assignment policy

## Environment

- Remote: `chorus-research`
- Base URL: `http://127.0.0.1:3000`
- Sample count per endpoint: `10`
- Company UUID: `7b1ceb90-346e-42e9-aba3-c9046a835a22`
- Heavy project: `c9ba0a44-5528-4df4-8e71-e1f2e4b08033` / ASR SOTA模型测试
  - experiment runs: 0
  - research questions: 7
  - activities: 26
- Light project: `7e92d123-d999-442d-add0-b1da9fa55c93` / 海尔ASR模型对比POC
  - experiment runs: 0
  - research questions: 1
  - activities: 9

### Dataset Snapshot

| Entity | Count |
| --- | ---: |
| projects | 2 |
| ideas | 8 |
| tasks | 0 |
| activities | 35 |
| groups | 0 |
| compute_nodes | 1 |
| compute_gpus | 1 |

> Note: 当前租户没有 experiment runs，也没有 project groups，所以与 experiment-run / group-dashboard 相关的测量只能代表空态或轻负载路径。

## HTTP Timing Summary

| Endpoint | Runs | Avg DNS | Avg Connect | Avg TTFB | Avg Total | Max Total | Avg Bytes | HTTP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| API projects list | 10 | 0.0000 | 0.0001 | 0.0124 | 0.0128 | 0.0247 | 1211 | 200 |
| API project groups | 10 | 0.0000 | 0.0001 | 0.0098 | 0.0101 | 0.0127 | 66 | 200 |
| API heavy project detail | 10 | 0.0000 | 0.0001 | 0.0089 | 0.0092 | 0.0111 | 368 | 200 |
| API heavy activity | 10 | 0.0000 | 0.0002 | 0.0108 | 0.0111 | 0.0134 | 6946 | 200 |
| API heavy experiment runs | 10 | 0.0000 | 0.0002 | 0.0154 | 0.0156 | 0.0233 | 68 | 200 |
| API light project detail | 10 | 0.0000 | 0.0002 | 0.0106 | 0.0109 | 0.0174 | 380 | 200 |
| API light activity | 10 | 0.0000 | 0.0001 | 0.0220 | 0.0223 | 0.0529 | 3012 | 200 |
| API light experiment runs | 10 | 0.0000 | 0.0002 | 0.0131 | 0.0133 | 0.0155 | 68 | 200 |
| Page research projects | 10 | 0.0000 | 0.0002 | 0.0042 | 0.0043 | 0.0052 | 14038 | 200 |
| Page heavy dashboard | 10 | 0.0000 | 0.0001 | 0.0162 | 0.0356 | 0.0466 | 40439 | 200 |
| Page light dashboard | 10 | 0.0000 | 0.0001 | 0.0189 | 0.0327 | 0.0553 | 37687 | 200 |
| Page compute | 10 | 0.0000 | 0.0002 | 0.0139 | 0.0219 | 0.0260 | 20945 | 200 |

## Raw Timing Runs

### API projects list

- run 01: dns=0.000021s connect=0.000139s ttfb=0.023452s total=0.024726s size=1211 http=200
- run 02: dns=0.000018s connect=0.000131s ttfb=0.011415s total=0.011666s size=1211 http=200
- run 03: dns=0.000018s connect=0.000132s ttfb=0.010944s total=0.011200s size=1211 http=200
- run 04: dns=0.000020s connect=0.000131s ttfb=0.015531s total=0.015799s size=1211 http=200
- run 05: dns=0.000018s connect=0.000124s ttfb=0.009272s total=0.009559s size=1211 http=200
- run 06: dns=0.000020s connect=0.000133s ttfb=0.013016s total=0.013308s size=1211 http=200
- run 07: dns=0.000019s connect=0.000131s ttfb=0.009417s total=0.009695s size=1211 http=200
- run 08: dns=0.000019s connect=0.000128s ttfb=0.009791s total=0.010110s size=1211 http=200
- run 09: dns=0.000018s connect=0.000127s ttfb=0.009664s total=0.009917s size=1211 http=200
- run 10: dns=0.000021s connect=0.000133s ttfb=0.011965s total=0.012045s size=1211 http=200

### API project groups

- run 01: dns=0.000019s connect=0.000196s ttfb=0.009302s total=0.009651s size=66 http=200
- run 02: dns=0.000018s connect=0.000134s ttfb=0.009881s total=0.010169s size=66 http=200
- run 03: dns=0.000021s connect=0.000138s ttfb=0.010395s total=0.010696s size=66 http=200
- run 04: dns=0.000019s connect=0.000136s ttfb=0.009536s total=0.009819s size=66 http=200
- run 05: dns=0.000019s connect=0.000138s ttfb=0.009646s total=0.009936s size=66 http=200
- run 06: dns=0.000018s connect=0.000134s ttfb=0.008538s total=0.008880s size=66 http=200
- run 07: dns=0.000019s connect=0.000134s ttfb=0.008428s total=0.008710s size=66 http=200
- run 08: dns=0.000019s connect=0.000139s ttfb=0.009773s total=0.010049s size=66 http=200
- run 09: dns=0.000019s connect=0.000133s ttfb=0.009608s total=0.009898s size=66 http=200
- run 10: dns=0.000020s connect=0.000136s ttfb=0.012429s total=0.012709s size=66 http=200

### API heavy project detail

- run 01: dns=0.000021s connect=0.000138s ttfb=0.010610s total=0.011108s size=368 http=200
- run 02: dns=0.000020s connect=0.000174s ttfb=0.008600s total=0.008880s size=368 http=200
- run 03: dns=0.000020s connect=0.000133s ttfb=0.009050s total=0.009316s size=368 http=200
- run 04: dns=0.000019s connect=0.000131s ttfb=0.008289s total=0.008591s size=368 http=200
- run 05: dns=0.000020s connect=0.000135s ttfb=0.009272s total=0.009526s size=368 http=200
- run 06: dns=0.000023s connect=0.000137s ttfb=0.008666s total=0.008976s size=368 http=200
- run 07: dns=0.000020s connect=0.000137s ttfb=0.008139s total=0.008413s size=368 http=200
- run 08: dns=0.000021s connect=0.000141s ttfb=0.008887s total=0.009153s size=368 http=200
- run 09: dns=0.000020s connect=0.000138s ttfb=0.007916s total=0.008219s size=368 http=200
- run 10: dns=0.000020s connect=0.000142s ttfb=0.009153s total=0.009437s size=368 http=200

### API heavy activity

- run 01: dns=0.000022s connect=0.000136s ttfb=0.013080s total=0.013353s size=6946 http=200
- run 02: dns=0.000021s connect=0.000140s ttfb=0.010274s total=0.010552s size=6946 http=200
- run 03: dns=0.000025s connect=0.000139s ttfb=0.009322s total=0.009613s size=6946 http=200
- run 04: dns=0.000020s connect=0.000276s ttfb=0.012868s total=0.013170s size=6946 http=200
- run 05: dns=0.000020s connect=0.000130s ttfb=0.009229s total=0.009507s size=6946 http=200
- run 06: dns=0.000020s connect=0.000250s ttfb=0.010214s total=0.010506s size=6946 http=200
- run 07: dns=0.000019s connect=0.000134s ttfb=0.010206s total=0.010466s size=6946 http=200
- run 08: dns=0.000019s connect=0.000285s ttfb=0.011238s total=0.011512s size=6946 http=200
- run 09: dns=0.000019s connect=0.000130s ttfb=0.009343s total=0.009647s size=6946 http=200
- run 10: dns=0.000034s connect=0.000184s ttfb=0.012369s total=0.012769s size=6946 http=200

### API heavy experiment runs

- run 01: dns=0.000141s connect=0.000270s ttfb=0.021118s total=0.021361s size=68 http=200
- run 02: dns=0.000021s connect=0.000131s ttfb=0.013456s total=0.013744s size=68 http=200
- run 03: dns=0.000020s connect=0.000129s ttfb=0.023253s total=0.023321s size=68 http=200
- run 04: dns=0.000020s connect=0.000131s ttfb=0.017079s total=0.017516s size=68 http=200
- run 05: dns=0.000021s connect=0.000255s ttfb=0.012835s total=0.013105s size=68 http=200
- run 06: dns=0.000019s connect=0.000131s ttfb=0.015808s total=0.015884s size=68 http=200
- run 07: dns=0.000033s connect=0.000145s ttfb=0.011929s total=0.012247s size=68 http=200
- run 08: dns=0.000020s connect=0.000133s ttfb=0.011760s total=0.012012s size=68 http=200
- run 09: dns=0.000023s connect=0.000138s ttfb=0.014578s total=0.014857s size=68 http=200
- run 10: dns=0.000020s connect=0.000133s ttfb=0.011797s total=0.012034s size=68 http=200

### API light project detail

- run 01: dns=0.000021s connect=0.000146s ttfb=0.013856s total=0.013933s size=380 http=200
- run 02: dns=0.000021s connect=0.000149s ttfb=0.010633s total=0.010934s size=380 http=200
- run 03: dns=0.000022s connect=0.000140s ttfb=0.008155s total=0.008444s size=380 http=200
- run 04: dns=0.000023s connect=0.000151s ttfb=0.008662s total=0.008946s size=380 http=200
- run 05: dns=0.000026s connect=0.000150s ttfb=0.008523s total=0.008812s size=380 http=200
- run 06: dns=0.000039s connect=0.000156s ttfb=0.009138s total=0.009490s size=380 http=200
- run 07: dns=0.000023s connect=0.000146s ttfb=0.010206s total=0.010488s size=380 http=200
- run 08: dns=0.000022s connect=0.000194s ttfb=0.009176s total=0.009477s size=380 http=200
- run 09: dns=0.000031s connect=0.000183s ttfb=0.010424s total=0.010726s size=380 http=200
- run 10: dns=0.000022s connect=0.000144s ttfb=0.017125s total=0.017437s size=380 http=200

### API light activity

- run 01: dns=0.000020s connect=0.000131s ttfb=0.009055s total=0.009327s size=3012 http=200
- run 02: dns=0.000021s connect=0.000134s ttfb=0.009019s total=0.009298s size=3012 http=200
- run 03: dns=0.000021s connect=0.000137s ttfb=0.015216s total=0.015516s size=3012 http=200
- run 04: dns=0.000021s connect=0.000174s ttfb=0.029692s total=0.030011s size=3012 http=200
- run 05: dns=0.000020s connect=0.000137s ttfb=0.028844s total=0.029217s size=3012 http=200
- run 06: dns=0.000023s connect=0.000147s ttfb=0.012142s total=0.012880s size=3012 http=200
- run 07: dns=0.000021s connect=0.000153s ttfb=0.009944s total=0.010239s size=3012 http=200
- run 08: dns=0.000020s connect=0.000133s ttfb=0.019247s total=0.019593s size=3012 http=200
- run 09: dns=0.000026s connect=0.000150s ttfb=0.052522s total=0.052866s size=3012 http=200
- run 10: dns=0.000026s connect=0.000148s ttfb=0.033979s total=0.034385s size=3012 http=200

### API light experiment runs

- run 01: dns=0.000026s connect=0.000143s ttfb=0.013099s total=0.013361s size=68 http=200
- run 02: dns=0.000021s connect=0.000134s ttfb=0.012058s total=0.012315s size=68 http=200
- run 03: dns=0.000025s connect=0.000143s ttfb=0.011991s total=0.012251s size=68 http=200
- run 04: dns=0.000019s connect=0.000138s ttfb=0.013547s total=0.013835s size=68 http=200
- run 05: dns=0.000030s connect=0.000159s ttfb=0.015274s total=0.015548s size=68 http=200
- run 06: dns=0.000021s connect=0.000140s ttfb=0.013858s total=0.014129s size=68 http=200
- run 07: dns=0.000020s connect=0.000132s ttfb=0.012332s total=0.012600s size=68 http=200
- run 08: dns=0.000021s connect=0.000135s ttfb=0.012234s total=0.012539s size=68 http=200
- run 09: dns=0.000022s connect=0.000295s ttfb=0.012869s total=0.013123s size=68 http=200
- run 10: dns=0.000021s connect=0.000138s ttfb=0.013387s total=0.013675s size=68 http=200

### Page research projects

- run 01: dns=0.000019s connect=0.000301s ttfb=0.004532s total=0.004602s size=14038 http=200
- run 02: dns=0.000019s connect=0.000137s ttfb=0.004147s total=0.004212s size=14038 http=200
- run 03: dns=0.000018s connect=0.000275s ttfb=0.005154s total=0.005224s size=14038 http=200
- run 04: dns=0.000057s connect=0.000168s ttfb=0.004163s total=0.004234s size=14038 http=200
- run 05: dns=0.000020s connect=0.000135s ttfb=0.003993s total=0.004055s size=14038 http=200
- run 06: dns=0.000019s connect=0.000131s ttfb=0.004062s total=0.004129s size=14038 http=200
- run 07: dns=0.000019s connect=0.000130s ttfb=0.004042s total=0.004110s size=14038 http=200
- run 08: dns=0.000018s connect=0.000137s ttfb=0.004094s total=0.004158s size=14038 http=200
- run 09: dns=0.000018s connect=0.000176s ttfb=0.004109s total=0.004176s size=14038 http=200
- run 10: dns=0.000066s connect=0.000189s ttfb=0.004149s total=0.004216s size=14038 http=200

### Page heavy dashboard

- run 01: dns=0.000021s connect=0.000140s ttfb=0.016442s total=0.046603s size=40439 http=200
- run 02: dns=0.000019s connect=0.000134s ttfb=0.015360s total=0.031234s size=40439 http=200
- run 03: dns=0.000021s connect=0.000135s ttfb=0.014103s total=0.027432s size=40439 http=200
- run 04: dns=0.000020s connect=0.000135s ttfb=0.020450s total=0.032516s size=40439 http=200
- run 05: dns=0.000020s connect=0.000135s ttfb=0.014870s total=0.041010s size=40439 http=200
- run 06: dns=0.000021s connect=0.000137s ttfb=0.014037s total=0.029401s size=40439 http=200
- run 07: dns=0.000021s connect=0.000139s ttfb=0.019215s total=0.046056s size=40439 http=200
- run 08: dns=0.000021s connect=0.000141s ttfb=0.017282s total=0.032552s size=40439 http=200
- run 09: dns=0.000022s connect=0.000158s ttfb=0.014166s total=0.030540s size=40439 http=200
- run 10: dns=0.000019s connect=0.000133s ttfb=0.015688s total=0.038459s size=40439 http=200

### Page light dashboard

- run 01: dns=0.000023s connect=0.000148s ttfb=0.016348s total=0.031233s size=37687 http=200
- run 02: dns=0.000023s connect=0.000150s ttfb=0.013748s total=0.025896s size=37687 http=200
- run 03: dns=0.000024s connect=0.000151s ttfb=0.017701s total=0.032968s size=37687 http=200
- run 04: dns=0.000022s connect=0.000142s ttfb=0.017871s total=0.030442s size=37687 http=200
- run 05: dns=0.000022s connect=0.000144s ttfb=0.013942s total=0.026425s size=37687 http=200
- run 06: dns=0.000022s connect=0.000150s ttfb=0.015014s total=0.035368s size=37687 http=200
- run 07: dns=0.000023s connect=0.000141s ttfb=0.043176s total=0.055306s size=37687 http=200
- run 08: dns=0.000030s connect=0.000160s ttfb=0.015160s total=0.028184s size=37687 http=200
- run 09: dns=0.000021s connect=0.000146s ttfb=0.014282s total=0.026857s size=37687 http=200
- run 10: dns=0.000021s connect=0.000141s ttfb=0.021573s total=0.034062s size=37687 http=200

### Page compute

- run 01: dns=0.000019s connect=0.000282s ttfb=0.014869s total=0.023120s size=20945 http=200
- run 02: dns=0.000019s connect=0.000133s ttfb=0.012507s total=0.020341s size=20945 http=200
- run 03: dns=0.000019s connect=0.000130s ttfb=0.015260s total=0.022641s size=20945 http=200
- run 04: dns=0.000017s connect=0.000184s ttfb=0.013895s total=0.021808s size=20945 http=200
- run 05: dns=0.000018s connect=0.000135s ttfb=0.013114s total=0.024755s size=20945 http=200
- run 06: dns=0.000018s connect=0.000130s ttfb=0.012438s total=0.020143s size=20945 http=200
- run 07: dns=0.000018s connect=0.000132s ttfb=0.013334s total=0.020256s size=20945 http=200
- run 08: dns=0.000022s connect=0.000132s ttfb=0.018124s total=0.025982s size=20945 http=200
- run 09: dns=0.000019s connect=0.000130s ttfb=0.012671s total=0.020028s size=20945 http=200
- run 10: dns=0.000018s connect=0.000132s ttfb=0.012574s total=0.019733s size=20945 http=200

## SQL Plans

### Project list query

```sql
                                                                                              QUERY PLAN                                                                                              
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8.17..8.18 rows=1 width=284) (actual time=0.054..0.055 rows=2 loops=1)
   Output: uuid, name, description, goal, datasets, "evaluationMethods", "latestSynthesisAt", "latestSynthesisIdeaCount", "latestSynthesisSummary", "groupUuid", "createdAt", "updatedAt"
   Buffers: shared hit=5
   ->  Sort  (cost=8.17..8.18 rows=1 width=284) (actual time=0.054..0.054 rows=2 loops=1)
         Output: uuid, name, description, goal, datasets, "evaluationMethods", "latestSynthesisAt", "latestSynthesisIdeaCount", "latestSynthesisSummary", "groupUuid", "createdAt", "updatedAt"
         Sort Key: p."updatedAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=5
         ->  Index Scan using "Project_companyUuid_idx" on public."Project" p  (cost=0.14..8.16 rows=1 width=284) (actual time=0.016..0.017 rows=2 loops=1)
               Output: uuid, name, description, goal, datasets, "evaluationMethods", "latestSynthesisAt", "latestSynthesisIdeaCount", "latestSynthesisSummary", "groupUuid", "createdAt", "updatedAt"
               Index Cond: (p."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
               Buffers: shared hit=2
 Planning:
   Buffers: shared hit=154
 Planning Time: 0.554 ms
 Execution Time: 0.086 ms
(16 rows)
```

### Project activity query

```sql
                                                                          QUERY PLAN                                                                           
---------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8.17..8.18 rows=1 width=232) (actual time=0.094..0.097 rows=20 loops=1)
   Output: uuid, "targetType", "targetUuid", action, value, "actorType", "actorUuid", "createdAt"
   Buffers: shared hit=6
   ->  Sort  (cost=8.17..8.18 rows=1 width=232) (actual time=0.093..0.094 rows=20 loops=1)
         Output: uuid, "targetType", "targetUuid", action, value, "actorType", "actorUuid", "createdAt"
         Sort Key: a."createdAt" DESC
         Sort Method: quicksort  Memory: 33kB
         Buffers: shared hit=6
         ->  Index Scan using "Activity_projectUuid_idx" on public."Activity" a  (cost=0.14..8.16 rows=1 width=232) (actual time=0.024..0.041 rows=26 loops=1)
               Output: uuid, "targetType", "targetUuid", action, value, "actorType", "actorUuid", "createdAt"
               Index Cond: (a."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
               Filter: (a."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
               Buffers: shared hit=3
 Planning:
   Buffers: shared hit=182
 Planning Time: 0.617 ms
 Execution Time: 0.131 ms
(17 rows)
```

### Project stats query

```sql
                                                                                QUERY PLAN                                                                                 
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=24.60..24.61 rows=3 width=72) (actual time=0.487..0.489 rows=4 loops=1)
   Output: ('idea'::text), "Idea".status, (count(*))
   Sort Key: ('idea'::text), "Idea".status
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=9
   ->  Append  (cost=8.17..24.58 rows=3 width=72) (actual time=0.229..0.327 rows=4 loops=1)
         Buffers: shared hit=6
         ->  GroupAggregate  (cost=8.17..8.19 rows=1 width=72) (actual time=0.228..0.231 rows=2 loops=1)
               Output: 'idea'::text, "Idea".status, count(*)
               Group Key: "Idea".status
               Buffers: shared hit=2
               ->  Sort  (cost=8.17..8.18 rows=1 width=32) (actual time=0.221..0.222 rows=7 loops=1)
                     Output: "Idea".status
                     Sort Key: "Idea".status
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=2
                     ->  Index Scan using "Idea_projectUuid_idx" on public."Idea"  (cost=0.14..8.16 rows=1 width=32) (actual time=0.198..0.202 rows=7 loops=1)
                           Output: "Idea".status
                           Index Cond: ("Idea"."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
                           Filter: ("Idea"."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
                           Buffers: shared hit=2
         ->  GroupAggregate  (cost=8.17..8.19 rows=1 width=72) (actual time=0.055..0.056 rows=1 loops=1)
               Output: 'experiment'::text, "Experiment".status, count(*)
               Group Key: "Experiment".status
               Buffers: shared hit=2
               ->  Sort  (cost=8.17..8.18 rows=1 width=32) (actual time=0.052..0.052 rows=3 loops=1)
                     Output: "Experiment".status
                     Sort Key: "Experiment".status
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=2
                     ->  Index Scan using "Experiment_projectUuid_idx" on public."Experiment"  (cost=0.14..8.16 rows=1 width=32) (actual time=0.025..0.027 rows=3 loops=1)
                           Output: "Experiment".status
                           Index Cond: ("Experiment"."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
                           Filter: ("Experiment"."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
                           Buffers: shared hit=2
         ->  GroupAggregate  (cost=0.15..8.18 rows=1 width=72) (actual time=0.038..0.039 rows=1 loops=1)
               Output: 'document'::text, 'all'::text, count(*)
               Buffers: shared hit=2
               ->  Index Scan using "Document_projectUuid_idx" on public."Document"  (cost=0.15..8.17 rows=1 width=0) (actual time=0.035..0.037 rows=2 loops=1)
                     Index Cond: ("Document"."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
                     Filter: ("Document"."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
                     Buffers: shared hit=2
 Planning:
   Buffers: shared hit=467
 Planning Time: 1.263 ms
 Execution Time: 0.673 ms
(46 rows)
```

### Experiment runs list query

```sql
                                                                                                                              QUERY PLAN                                                                                                                               
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8.17..8.18 rows=1 width=448) (actual time=0.046..0.046 rows=0 loops=1)
   Output: uuid, title, description, status, priority, "computeBudgetHours", "acceptanceCriteria", outcome, "experimentResults", "assigneeType", "assigneeUuid", "assignedAt", "assignedByUuid", "proposalUuid", "createdByUuid", "createdAt", "updatedAt"
   Buffers: shared hit=8
   ->  Sort  (cost=8.17..8.18 rows=1 width=448) (actual time=0.045..0.045 rows=0 loops=1)
         Output: uuid, title, description, status, priority, "computeBudgetHours", "acceptanceCriteria", outcome, "experimentResults", "assigneeType", "assigneeUuid", "assignedAt", "assignedByUuid", "proposalUuid", "createdByUuid", "createdAt", "updatedAt"
         Sort Key: t.priority DESC, t."createdAt" DESC
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=8
         ->  Index Scan using "Task_projectUuid_idx" on public."Task" t  (cost=0.14..8.16 rows=1 width=448) (actual time=0.003..0.003 rows=0 loops=1)
               Output: uuid, title, description, status, priority, "computeBudgetHours", "acceptanceCriteria", outcome, "experimentResults", "assigneeType", "assigneeUuid", "assignedAt", "assignedByUuid", "proposalUuid", "createdByUuid", "createdAt", "updatedAt"
               Index Cond: (t."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
               Filter: (t."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text)
               Buffers: shared hit=2
 Planning:
   Buffers: shared hit=213
 Planning Time: 0.919 ms
 Execution Time: 0.104 ms
(17 rows)
```

### Unblocked experiment runs query

```sql
                                                                      QUERY PLAN                                                                      
------------------------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=21.74..21.74 rows=1 width=136) (actual time=0.053..0.054 rows=0 loops=1)
   Output: t.uuid, t.title, t.status, t.priority, t."createdAt"
   Sort Key: t.priority DESC, t."createdAt" DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=8
   ->  Nested Loop Anti Join  (cost=4.47..21.73 rows=1 width=136) (actual time=0.004..0.005 rows=0 loops=1)
         Output: t.uuid, t.title, t.status, t.priority, t."createdAt"
         Buffers: shared hit=2
         ->  Index Scan using "Task_projectUuid_idx" on public."Task" t  (cost=0.14..8.17 rows=1 width=136) (actual time=0.004..0.004 rows=0 loops=1)
               Output: t.uuid, t.title, t.status, t.priority, t."createdAt"
               Index Cond: (t."projectUuid" = 'c9ba0a44-5528-4df4-8e71-e1f2e4b08033'::text)
               Filter: ((t.status = ANY ('{open,assigned}'::text[])) AND (t."companyUuid" = '7b1ceb90-346e-42e9-aba3-c9046a835a22'::text))
               Buffers: shared hit=2
         ->  Nested Loop  (cost=4.33..13.53 rows=3 width=32) (never executed)
               Output: d."taskUuid"
               Inner Unique: true
               ->  Bitmap Heap Scan on public."TaskDependency" d  (cost=4.18..12.64 rows=4 width=64) (never executed)
                     Output: d.id, d."taskUuid", d."dependsOnUuid", d."createdAt"
                     Recheck Cond: (d."taskUuid" = t.uuid)
                     ->  Bitmap Index Scan on "TaskDependency_taskUuid_dependsOnUuid_key"  (cost=0.00..4.18 rows=4 width=0) (never executed)
                           Index Cond: (d."taskUuid" = t.uuid)
               ->  Index Scan using "Task_uuid_key" on public."Task" dep  (cost=0.14..0.22 rows=1 width=32) (never executed)
                     Output: dep.uuid
                     Index Cond: (dep.uuid = d."dependsOnUuid")
                     Filter: (dep.status <> ALL ('{done,closed}'::text[]))
 Planning:
   Buffers: shared hit=314
 Planning Time: 1.332 ms
 Execution Time: 0.156 ms
(29 rows)
```

### Notification preference lookup

```sql
                                                                                                      QUERY PLAN                                                                                                      
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Index Scan using "NotificationPreference_ownerType_ownerUuid_key" on public."NotificationPreference" np  (cost=0.15..8.17 rows=1 width=106) (actual time=0.019..0.020 rows=1 loops=1)
   Output: uuid, "ownerType", "ownerUuid", mentioned, "commentAdded", "taskAssigned", "taskStatusChanged", "taskVerified", "taskReopened", "proposalSubmitted", "proposalApproved", "proposalRejected", "ideaClaimed"
   Index Cond: ((np."ownerType" = 'user'::text) AND (np."ownerUuid" = '6d37da34-f7cc-4097-8afa-f06e0799bedd'::text))
   Buffers: shared hit=2
 Planning:
   Buffers: shared hit=147
 Planning Time: 0.399 ms
 Execution Time: 0.057 ms
(8 rows)
```

## Findings


- 项目统计口径仍然分散在项目列表、项目详情、dashboard、group dashboard 和页面直查 Prisma 中，属于重复计算热点。
- 本租户当前 `Task` 数据为 0，说明 experiment-run 相关接口暂时没有真实负载，但这也暴露出项目列表和 dashboard 依旧在为旧 `Experiment` 口径做统计。
- `Activity` 是当前最有代表性的高频数据表，重项目活动数明显高于轻项目，后续应优先收敛 activity 与 project metrics 的读路径。
- 当前租户没有 `ProjectGroup` 数据，因此 group dashboard 只能先按代码路径整改，等真实分组数据出现后再补第二轮基线。
- `/compute` 已具备真实页面与真实节点数据，后续拆分 GPU poller 时可直接用这一路径做前后对比。

## Execution Checklist

1. 新增 `ProjectMetricsSnapshot` 与统一 metrics service，收口项目列表、项目详情、dashboard、group dashboard 的统计口径。
2. 把当前 route/page 里的 Prisma 直查迁到 service/read-model 边界，优先处理 `research-projects` 列表和 dashboard。
3. 基于统一读模型，评估并落地第一批复合索引：`Task(companyUuid, projectUuid, status, createdAt)`、`Idea(companyUuid, projectUuid, status)`、`Activity(companyUuid, projectUuid, createdAt)`。
4. 将 `notification-listener` 改成批量 context resolver，合并 entity title、actor、recipient 和 preference 查询。
5. 将 GPU telemetry 轮询从 Web 请求链路剥离为独立 worker 或定时任务，`listComputePools` 只读快照。
6. 补 `pnpm preflight`，覆盖 DB、Redis、default auth、standalone build、自身健康检查。
7. 完成上述改动后，用同一脚本重复采样，并将新结果附加到下一份基线报告中做前后对比。

## Recommended Next Steps

1. 先实现统一的 `project-metrics` read model，替换项目列表、项目详情、dashboard、group dashboard 当前各算一套的做法。
2. 在 read model 落地后再补复合索引，优先从 `Task(companyUuid, projectUuid, status, createdAt)`、`Idea(companyUuid, projectUuid, status)`、`Activity(companyUuid, projectUuid, createdAt)` 开始。
3. 把 `notification-listener` 改成批量 context resolver，再做一次同批接口和 SQL 基线对比。
4. 将 GPU telemetry 轮询从 Web 请求路径拆出，保留 `/compute` 作为 smoke 与性能回归页面。
5. 等读路径和后台副作用稳定后，再进入 `experiment-run.service` 拆分与 assignment policy 抽离。
