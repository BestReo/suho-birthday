// ============================================================
//  여기만 고치면 됨! (게임 코드는 game.js — 건드릴 필요 없음)
// ============================================================
window.GAME_CONFIG = {
  // 친구 이름 (받침에 따라 "OO아 / OO야"가 자동으로 붙음)
  friendName: '수호',
  friendAge: 11,       // 만 나이 (2015년생)
  fromName: '준우',    // 보내는 사람

  // 게임 시작할 때 떨어뜨리는 공은 1단계 ~ spawnLevels단계 중 랜덤
  spawnLevels: 5,

  // ----------------------------------------------------------
  //  진화 단계 (작은 것 → 큰 것 순서)
  //  - 사진을 넣으려면 photos 폴더에 파일을 넣고 img: 'photos/1.jpg' 처럼 적기
  //  - img가 없거나 못 불러오면 emoji가 대신 나옴
  //  - imgPos: 얼굴 위치 [가로, 세로] (0~1, 기본 [0.5, 0.5] = 가운데)
  //  - imgZoom: 확대 배율 (기본 1, 얼굴을 크게 하려면 1.3 등)
  //  - 단계가 많을수록 어려움 (지금 10단계). 마지막 단계를 만들면 성공 + 편지
  // ----------------------------------------------------------
  stages: [
    { name: '아기 수호',     emoji: '🍬', color: '#ffc8dd', img: 'photos/stage1.jpg', caption: '비니 쓴 아기 시절' },
    { name: '뽀시래기',      emoji: '🍓', color: '#ffadad', img: 'photos/stage2.jpg', caption: '카드 들고 심각' },
    { name: '장난감 사장님', emoji: '🍪', color: '#f6d6ad', img: 'photos/stage3.jpg', caption: '장난감 전부 내 거' },
    { name: '해맑음 폭발',   emoji: '🍩', color: '#ffc6a5', img: 'photos/stage4.jpg', caption: '이 웃음 반칙 아니냐' },
    { name: '볼 꾹',         emoji: '🧁', color: '#d8c3f0', img: 'photos/stage5.jpg', caption: '귀여운 척 1단계' },
    { name: '한복 도련님',   emoji: '🍦', color: '#c7e3ff', img: 'photos/stage6.jpg', caption: '여기부턴 합쳐야만 나옴' },
    { name: '산타 조수',     emoji: '🎈', color: '#ffb3b3', img: 'photos/stage7.jpg', caption: '메리 크리스마스' },
    { name: '태권 소년',     emoji: '🎁', color: '#b9d3ff', img: 'photos/stage8.jpg', caption: '띠 따고 인증샷' },
    { name: '지금의 수호',   emoji: '🎉', color: '#fff3a8', img: 'photos/stage9.jpg', caption: '브이는 못 참지' },
    { name: '생일 케이크',   emoji: '🎂', color: '#ffd8a8', img: null, caption: '{이름아} 생일 축하해 🎉' },
  ],

  // ----------------------------------------------------------
  //  케이크를 만들면 편지 다음에 열리는 앨범 (순서대로 한 장씩 넘김)
  //  caption은 사진 아래 손글씨로 들어감 — 자유롭게 고쳐도 됨
  // ----------------------------------------------------------
  albumTitle: '{이름}의 성장 앨범',
  albumCover: 'photos/stage9.jpg',
  album: [
    { src: 'photos/album/01.jpg', caption: '현관 탈출 시도 중' },
    { src: 'photos/album/02.jpg', caption: '비니 쓴 아기 수호' },
    { src: 'photos/album/03.jpg', caption: '카드 들고 심각' },
    { src: 'photos/album/04.jpg', caption: '크리스마스 트리 옆에서' },
    { src: 'photos/album/05.jpg', caption: '한복 입고 찰칵' },
    { src: 'photos/album/06.jpg', caption: '장난감 전부 내 거' },
    { src: 'photos/album/07.jpg', caption: '이 웃음 반칙 아니냐' },
    { src: 'photos/album/08.jpg', caption: '단풍 구경' },
    { src: 'photos/album/09.jpg', caption: '가을 산책' },
    { src: 'photos/album/10.jpg', caption: '볼 꾹 — 귀여운 척' },
    { src: 'photos/album/11.jpg', caption: '한복 도련님' },
    { src: 'photos/album/12.jpg', caption: '사진관 모델 데뷔' },
    { src: 'photos/album/13.jpg', caption: '산타 조수 등장' },
    { src: 'photos/album/14.jpg', caption: '두 발 자전거 도전' },
    { src: 'photos/album/15.jpg', caption: '태권도 인증샷' },
    { src: 'photos/album/16.jpg', caption: '레고 득템!' },
    { src: 'photos/album/17.jpg', caption: '돌고래 두 마리 득템' },
    { src: 'photos/album/18.jpg', caption: '브이는 못 참지' },
    { src: 'photos/album/19.jpg', caption: '장난감 가게 나들이' },
  ],
  albumEnd: '앞으로의 페이지도\n같이 채워가자!',

  // ----------------------------------------------------------
  //  마지막 단계(케이크)를 만들 때마다 화면에 뜨는 편지
  //  {이름} → 친구 이름,  {이름아} → "OO아" 또는 "OO야"
  // ----------------------------------------------------------
  letterTitle: '💌 수호에게',
  letter: `수호야, 생일 축하해! 🎂

여기까지 합치느라 진짜 고생 많았다.
사실 이 게임, 네 생일 선물로
내가 직접 만든 거야.

사탕 하나에서 시작해서
결국 케이크까지 만들어낸 것처럼,
네가 올해 하나씩 쌓아가는 것들도
분명 멋진 걸로 합쳐질 거라고 믿어.

생일은 지났지만 생일 축하해!
올해도 아프지 말고 귀도 빨리 나아! :)

- 준우가`,

  // ----------------------------------------------------------
  //  🪜 수호 점프에서 100계단 도착할 때마다 뜨는 편지 (합치기 편지랑 다름)
  // ----------------------------------------------------------
  jumpLetterAt: 100,
  jumpLetterTitle: '🪜 100계단 도착! {이름}에게',
  jumpLetter: `{이름아}, 100계단 올라온 거 실화냐?

솔직히 여기까지 못 올 줄 알았는데
역시 수호다. 인정.

계단 오르는 것처럼
가끔 방향 틀려서 떨어져도
다시 처음부터 올라가면 되는 거야.

올해 네가 올라갈 계단도
한 칸 한 칸 다 응원할게.
막히면 언제든 불러, 같이 올라가 줄게.

다시 한번 생일 축하해! 🎉

- 준우가

P.S. 🍉 합치기에서 케이크 만들면
다른 편지도 있어 👀`,

  // ----------------------------------------------------------
  //  🔨 수호 두더지 잡기
  //  제한 시간 안에 목표만큼 잡으면 → 케이크 + 카운트다운 + 생일 축하 노래 + 촛불 끄기
  // ----------------------------------------------------------
  moleTime: 60,        // 제한 시간 (초)
  moleTarget: 50,      // 목표 마릿수 (👑 금색 수호는 3마리로 쳐줌)
  moleCandles: 11,     // 케이크 촛불 개수 (수호 만 나이)
  moleSongCountdown: 5, // 노래 시작 전 카운트다운 (초)
  moleFaces: Array.from({ length: 19 }, (_, i) => `photos/face/${String(i + 1).padStart(2, '0')}.jpg`),

  // ----------------------------------------------------------
  //  🎂 케이크 쌓기 — 목표 층 넘기면 🎖️ 상장
  // ----------------------------------------------------------
  stackTarget: 20,
  certAward: '최고의 파티시에상',
  certIssuer: '수호 생일 축하 위원회',

  // ----------------------------------------------------------
  //  🎁 선물 받기 — 목표 점수 넘기면 🎆 불꽃놀이 + 🎟️ 쿠폰
  // ----------------------------------------------------------
  catchTarget: 50,
  couponTitle: '떡볶이 사주기',
  couponNote: '준우한테 이 화면 보여주면 떡볶이 사줌 😎',
};
