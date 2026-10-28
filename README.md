# Toastal Express

실행: `node server.js` (Node 18+, 설치할 패키지 없음) → http://localhost:3000
- 기기별 ID: 브라우저마다 5자리 ID 자동 발급 (기본)
- IP별 ID: `ID_BY_IP=1 node server.js`
- 데이터: `data.json` 에 저장

## 더미 → 실제 그래픽 교체
`public/style.css` 맨 위 `:root` 의 `--toast-img`, `--toaster-img`, `--bag-img` 에 `url(assets/xxx.png)` 를 넣으면 더미 대신 표시됩니다.
폰트는 `--font-display / --font-body / --font-sauce`.
잼 질감 사진은 `public/assets/jam.jpg` 로 넣으면 적용 (없으면 자동 생성 무늬).

## 웹에 올리기 (GitHub + 서버)

GitHub Pages 는 정적 파일만 올릴 수 있어서 이 사이트(서버가 있는 사이트)는 거기서 돌릴 수 없어요.
GitHub 에는 코드를 올리고, Node 서버를 돌려 주는 곳(Render, Railway, Fly.io 등)에 연결하세요.

1. 이 폴더를 GitHub 저장소로 올려요. (`.gitignore` 덕분에 `data.json` 은 올라가지 않아요.)
2. Render 등에서 저장소를 연결하고 시작 명령을 `node server.js` 로 설정해요. (포트는 자동으로 잡혀요.)
3. 저장 데이터(ID, 토스트, 친구)가 서버를 다시 켜도 남으려면 영구 디스크가 필요해요.
   디스크를 `/data` 에 붙이고 환경변수 `DATA_DIR=/data` 를 넣으세요. (`render.yaml` 에 예시가 있어요.)
   무료 플랜은 디스크가 없어서 서버가 재시작/잠들 때 데이터가 지워질 수 있어요.
