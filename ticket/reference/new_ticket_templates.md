# **🎫 에이전트 티켓 시스템 통합 가이드**

이 문서는 AI 에이전트와의 원활한 협업과 컨텍스트 핸드오버(Context Handover)를 위해 사용되는 초경량 상태 관리 티켓의 네이밍 규칙과 템플릿을 정의합니다.

## **1. 📁 파일 네이밍 컨벤션 (Naming Convention)**

상위 디렉터리로 티켓의 타입을 명확히 구분하고, 파일명은 에이전트의 파싱 효율과 시간순 정렬(Chronological order)을 최우선으로 고려하여 작성합니다.

* **기본 구조:** [YYYYMMDD_HHMM]_[속성/주제].yml  
* **확장자:** 에이전트의 토큰 최적화 및 가독성을 위해 반드시 .yml을 사용합니다.

**📌 타입별 디렉터리 및 네이밍 예시**

* **Session:** /session/20260725_1530_oauth_update.yml  
* **Implement:** /impl/20260726_1000_redis_cache.yml  
* **Debug:** /debug/20260727_1420_token_expired_error.yml  
* **Project:** /project/20260701_0900_mvp_phase_1.yml  
* **History:** /hist/20260730_1800_weekly_handover.yml

## **2. 티켓 ID 규칙**
에이전트가 다른 티켓을 참조(project_ref 등)하거나 검색할 때 고유성을 보장할 수 있도록 [접두사]-[식별자] 포맷을 사용합니다.

| 티켓 타입 | ID 구조 | 작성 예시 |
| :--- | :--- | :--- |
| **Session Snapshot** | `SESS-[YYYYMMDD]-[순번/시간]` | `SESS-20260725-01` |
| **Project Blueprint** | `PRJ-[프로젝트/마일스톤 약어]` | `PRJ-OAUTH-MVP` |
| **History Ticket** | `HIST-[YYYYMMDD]-[순번]` | `HIST-20260725-01` |
| **Guideline Ticket** | `GUIDE-[도메인/범위]` | `GUIDE-CORE-RULES` |

## **2. 📝 에이전트 전용 YAML 템플릿**

에이전트가 최소한의 토큰으로 완벽하게 상태를 파악할 수 있도록, 불필요한 서술형 문장을 배제하고 Key-Value 기반의 경량화된 구조를 사용합니다.

### **1) [요약형] SESSION SNAPSHOT TICKET**

> **목적:** 단일 세션 완료 후 진행 상태와 확정된 변경점을 기록합니다.

```
# 🎫 SESSION SNAPSHOT TICKET  
type: "SESSION_SNAPSHOT"  
id: "[번호]"  
# ━━━  
update: "[YYYY-MM-DD HH:MM]"  
# ━━━  
subject: "[주제]"  
# ━━━  
context: "[이번 세션 맥락 한 줄 요약]"  
# ━━━  
decisions:  
  - "[이번 세션에서 확정/합의된 사항 1]"  
  - "[이번 세션에서 확정/합의된 사항 2]"  
# ━━━  
tasks:  
  completed:  
    - "[완료된 파일명/모듈 1]"  
  pending:  
    - "[대기 중이거나 이관할 작업 1]"  
# ━━━  
data:  
  pr_url: "[참고할 PR URL 또는 N/A]"  
  notes: "[기타 수치, 에러 코드 등 핵심 데이터]"
```

### **2) [작업형] PROJECT BLUEPRINT TICKET**

> **목적:** 마일스톤이나 전체 프로젝트의 불변하는 최종 목표와 기술적 제약 사항을 정의합니다.

```
# 🛠 PROJECT BLUEPRINT TICKET  
type: "PROJECT_TICKET"  
id: "[프로젝트명 또는 마일스톤명]"  
# ━━━  
goal: "[프로젝트가 달성해야 할 최종 비즈니스/기능 목표]"  
# ━━━  
tech_stack:  
  language: "[사용 언어 및 버전]"  
  framework: "[프레임워크 및 핵심 라이브러리]"  
# ━━━  
current_progress: "[전체 마일스톤 기준 구현/검증 완료 단계]"  
# ━━━  
pending_issues:  
  - "[현재 블로킹된 버그]"  
  - "[다음 마일스톤 작업]"  
# ━━━  
constraints:  
  - "[아키텍처 제약, 비용, 성능 등 기술적 제약 1]"
```

### **3) [추적형] HISTORY TICKET**

> **목적:** 여러 세션에 걸쳐 누적된 시스템 변경점과 남은 기술 부채를 핸드오버합니다.
```
# 📜 HISTORY TICKET  
type: "HISTORY_TICKET"  
id: "[ID]"  
# ━━━  
update: "[마지막 핸드오버 날짜 및 시간]"  
# ━━━  
project_ref: "[연결된 🛠 PROJECT TICKET 명칭/ID]"  
# ━━━  
cumulative_changes:  
  - "[여러 세션에 걸쳐 누적 변경된 핵심 모듈/아키텍처 1]"  
# ━━━  
technical_debt:  
  - "[리팩토링 대상, 임시로 덮어둔 버그 등 1]"  
# ━━━  
next_session_start: "[새로운 세션이 즉시 컨텍스트를 이어받아 시작할 작업]"
```

### **4) [설정형] GUIDELINE TICKET**

> **목적:** 에이전트가 지켜야 할 공통 페르소나 및 코딩 컨벤션을 정의합니다.
```
# ⚙️ GUIDELINE TICKET  
type: "GUIDELINE_TICKET"  
id: "[ID]"  
# ━━━  
persona: "[에이전트가 취할 페르소나/역할]"  
# ━━━  
tone: "[답변 및 코드 작성 톤앤매너]"  
# ━━━  
rules:  
  readability: "[가독성 관련 규칙]"  
  mandatory:  
    - "[반드시 지켜야 할 필수 사항 1]"  
  restrictions:  
    - "[절대 금지 사항 및 제한 사항 1]"  
```