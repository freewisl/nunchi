# dkt-mods

<p align="center"><img src="plugins/nunchi/assets/banner.svg" alt="nunchi" width="100%"></p>

우리가 직접 만든 Claude Code mod 모음.

| Mod | 설명 |
|---|---|
| [nunchi](plugins/nunchi) | 눈치 빠른 Claude 마스코트: 입력창 위에서 상황에 맞게 움직이고, 입력창 아래 패널에 할 일·서브에이전트·git·PR·모델·사용량을 보여줌 |

## 설치

Claude Code에서:

```
/plugin marketplace add freewisl/claude-mods
/plugin install nunchi@dkt-mods
```

mod는 Claude Code 2.1.286 이상이 필요해요. 받은 저장소를 고치면서 쓰려면 경로로 추가해도 돼요: `/plugin marketplace add /path/to/claude-mods`.

## 미리보기 도구 (`tools/`)

Claude Code 안(`!`)이 아니라 터미널 탭에서 직접 실행하세요.

| 명령 | 하는 일 |
|---|---|
| `node tools/term-demo.mjs [--themes] [--live <motion>]` | 픽셀 마스코트를 터미널에 그림 |
| `node tools/smooth-demo.mjs [--live <motion>]` | 부드러운 마스코트를 kitty 그래픽으로 그림 |
| `node tools/make-sheet.mjs`, `node tools/make-smooth-sheet.mjs` | 동작 전체를 `sheet.svg`, `smooth-sheet.png`로 저장 |
| `node tools/make-sounds.mjs` | nunchi 소리(`plugins/nunchi/sounds/*.wav`)를 다시 합성 |
| `node tools/make-readme-art.mjs` | nunchi README 그림(`plugins/nunchi/assets/*.svg`: 배너, 데모, 스타일)을 nunchi 그리기 코드로 다시 그림 |
| `node tools/kitty-probe.mjs` | 터미널의 kitty 그래픽 지원 확인 (Orca에 Unicode placeholder 지원이 들어왔는지 볼 때) |

## 라이선스

[MIT](LICENSE)
