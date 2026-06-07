# Git Branch Strategy

## 개요

본 프로젝트는 `main`과 `dev` 브랜치를 중심으로 운영한다.

- `main`: 배포 가능한 안정 버전
- `dev`: 다음 배포를 위한 통합 개발 브랜치

모든 기능 개발은 `dev`를 기준으로 이루어지며, 충분한 검증 이후 `main`으로 병합하여 배포한다.

---

# 브랜치 역할

## main

운영 환경에 배포되는 브랜치이다.

특징:

- 항상 배포 가능한 상태 유지
- 직접 커밋 금지
- Pull Request를 통해서만 변경 가능
- 배포 이력 관리

예시:

```text
main
 ├─ Release v1.0
 ├─ Release v1.1
 └─ Release v1.2
```

---

## dev

개발 통합 브랜치이다.

특징:

- 새로운 기능 통합
- QA 및 테스트 수행
- 배포 전 검증 단계

예시:

```text
dev
 ├─ Feature A
 ├─ Feature B
 └─ Feature C
```

---

# 개발 프로세스

## 1. 기능 브랜치 생성

새로운 작업은 `dev`에서 분기한다.

```bash
git checkout dev
git pull origin dev

git checkout -b feature/login
```

---

## 2. 기능 개발

작업 완료 후 커밋한다.

```bash
git add .
git commit -m "Implement login feature"
```

---

## 3. dev로 병합

Pull Request 생성:

```text
feature/* → dev
```

코드 리뷰 후 병합한다. 병합은 Squash and Merge 사용을 권장한다.

---

## 4. 배포 준비

배포 가능한 상태가 되면 Pull Request 생성:

```text
dev → main
```

코드 리뷰 및 검증 후 병합한다.

---

# 배포 과정

배포는 항상 다음 순서로 진행한다.

```text
feature/*
      ↓
     dev
      ↓
    main
      ↓
   Production
```

---

# Merge 방식

## dev → main

GitHub Pull Request를 통한 Merge Commit 방식을 사용한다.

---

# main → dev 동기화

`dev → main` 병합 이후에는 `main`의 Merge Commit을 다시 `dev`에 반영한다.

목적:

- 브랜치 히스토리 정렬
- 이후 PR 생성 시 불필요한 diff 방지
- main/dev 간 ahead/behind 상태 제거

해당 작업은 GitHub Actions에 의해 자동으로 실행된다.

---

# 금지 사항

## dev, main 직접 커밋

금지:

```bash
git checkout main
git commit ...
git push origin main
```

모든 변경은 Pull Request를 통해 반영한다.

---

## dev와 무관한 브랜치에서 main 직접 병합

금지:

```text
feature/* → main
```

허용:

```text
feature/* → dev → main
```
