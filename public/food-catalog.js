import { getRecipeSpec } from "./recipe-specs.js";
export { OPTIONAL_INGREDIENT_NOTE } from "./recipe-specs.js";

export const CATALOG_REVIEWED_AT = "2026-09-13";

export const FOOD_CATALOG_SOURCES = Object.freeze({
  "food-safety-temperatures": {
    label: "FoodSafety.gov 안전한 최소 내부 온도",
    url: "https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures",
    scope: "가금류 74°C, 생선 63°C, 계란 요리 71°C, 남은 음식 재가열 74°C 등 안전 온도 기준"
  },
  "food-safety-four-steps": {
    label: "FoodSafety.gov 식품 안전 4단계",
    url: "https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety",
    scope: "냉장 4°C 이하, 냉동 -18°C 이하, 상온 방치 제한, 안전한 해동·세척 원칙"
  },
  "food-safety-cold-storage": {
    label: "FoodSafety.gov 냉장·냉동 보관표",
    url: "https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts",
    scope: "조리한 피자의 4°C 이하 냉장 보관 3~4일 기준"
  },
  "usda-shelf-stable": {
    label: "USDA 상온 보관 식품 안전",
    url: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/shelf-stable-food",
    scope: "미개봉 캔 보관과 개봉한 육류·생선 캔의 냉장 보관 원칙"
  },
  "bfr-potato": {
    label: "독일 연방위해평가원 감자 솔라닌 안내",
    url: "https://www.bfr.bund.de/en/press-release/solanine-in-potatoes-green-and-strongly-germinating-potato-tubers-should-be-sorted-out/",
    scope: "감자의 서늘하고 어둡고 건조한 보관과 녹색·강한 발아·심한 수축 감자 폐기"
  },
  "fsa-rice": {
    label: "영국 식품기준청 가정 식품 팩트체커",
    url: "https://www.gov.uk/government/publications/home-food-fact-checker/home-food-fact-checker",
    scope: "조리한 밥의 냉각·재가열, 소비기한 식품의 냄새 판단 한계, 달걀 부유 검사의 한계를 다루는 가정 식품 안내"
  },
  "maangchi-kimchi-fried-rice": {
    label: "Maangchi 김치볶음밥 조리 흐름",
    url: "https://www.maangchi.com/recipe/kimchi-bokkeumbap",
    scope: "김치를 먼저 볶고 밥을 넣은 뒤 참기름으로 마무리하는 조리 순서 참고"
  },
  "korean-bapsang-dubu-kimchi": {
    label: "Korean Bapsang 두부김치",
    url: "https://www.koreanbapsang.com/dubu-kimchi-tofu-with-stir-fried-kimchi/",
    scope: "두부는 따로 데우고 볶은 김치와 곁들이는 조리 구성 참고"
  },
  "10000recipe-egg-soup": {
    label: "만개의레시피 윤씨네키친 계란국",
    url: "https://www.10000recipe.com/recipe/7044262",
    scope: "끓는 국물에 계란물을 붓고 잠시 굳힌 뒤 섞는 조리 흐름 참고"
  },
  "maangchi-bibim-guksu": {
    label: "Maangchi 비빔국수 조리 흐름",
    url: "https://www.maangchi.com/recipe/bibim-guksu",
    scope: "소면을 삶아 찬물에 헹구고 물기를 뺀 뒤 차가운 양념과 섞는 순서 참고"
  },
  "barilla-pasta": {
    label: "Barilla 파스타 조리 안내",
    url: "https://www.barilla.com/en-us/help-with/pasta-kitchen-tips/how-to-cook-pasta",
    scope: "제품 표시 시간대로 면을 삶고 면수를 남긴 뒤 헹구지 않고 소스에서 마무리하는 흐름 참고"
  },
  "maangchi-gamjajeon": {
    label: "Maangchi 감자전 조리 흐름",
    url: "https://www.maangchi.com/recipe/gamjajeon",
    scope: "간 감자의 물을 빼고 가라앉은 전분을 다시 섞어 팬에서 부치는 방법 참고"
  },
  "maangchi-gyeran-mari": {
    label: "Maangchi 계란말이 조리 흐름",
    url: "https://www.maangchi.com/recipe/gyeran-mari",
    scope: "약불에서 얇은 계란층을 말고 뒤집어 속까지 익히는 방법 참고"
  },
  "onions-usa-storage": {
    label: "미국양파협회 양파 보관 안내",
    url: "https://www.onions-usa.org/onionista/how-to-store-an-onion/",
    scope: "통양파는 서늘하고 건조하며 통풍되는 곳, 껍질을 벗기거나 자른 양파는 밀폐 냉장하는 원칙"
  },
  "unl-food-storage": {
    label: "네브래스카대학교 식품 보관 안내",
    url: "https://food.unl.edu/free-resource/food-storage/",
    scope: "건조 식품·빵·육류와 햄 등 식품 상태별 보관 방식 참고"
  },
  "unl-carrot": {
    label: "네브래스카대학교 당근 보관 안내",
    url: "https://food.unl.edu/article/carrots/",
    scope: "잎을 제거한 당근을 봉투에 넣어 냉장하는 보관법"
  },
  "usda-mold": {
    label: "USDA 식품 곰팡이 안내",
    url: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/molds-food-are-they-dangerous",
    scope: "곰팡이가 생긴 빵은 오염 부위만 제거하지 않고 폐기하는 원칙"
  }
});

const ALIASES = Object.freeze({
  "즉석밥": ["밥", "햇반"], "배추김치": ["김치"], "스팸/햄": ["스팸", "햄"], "봉지라면": ["라면"],
  "냉동우동": ["우동", "우동면"], "냉동돈가스": ["돈가스", "돈까스"],
  "떡국떡": ["떡", "떡국 떡"], "계란": ["달걀"], "냉동만두": ["만두"], "김": ["김가루"],
  "치즈": ["모짜렐라치즈", "모차렐라치즈", "슬라이스치즈"]
});

export const FOOD_CATALOG = [
  {
    id: "staple",
    label: "즉석 주식",
    description: "밥, 면, 빵",
    children: [
      {
        id: "rice",
        label: "밥/죽",
        description: "전자레인지 한 끼",
        items: [
          foodItem("instant-rice", "즉석밥", ["즉석밥", "계란", "김치", "참기름", "김가루"], "즉석밥을 기본 탄수화물로 사용", [
            dish("김치계란덮밥", 10, "밥 위에 볶은 김치와 익힌 계란을 올립니다.", ["대파"]),
            dish("참치마요밥", 8, "참치와 마요네즈를 섞어 데운 밥 위에 올립니다.", ["참치캔", "마요네즈"]),
            dish("간장버터계란밥", 7, "기본 양념만으로 조리 시간이 짧습니다.", ["버터", "간장"])
          ]),
          foodItem("cup-rice", "컵밥", ["컵밥", "계란", "치즈", "대파", "김치"], "컵밥에 단백질과 채소를 보강", [
            dish("치즈컵밥그라탕", 12, "컵밥 위에 치즈를 올려 든든하게 바꿉니다.", ["모짜렐라"]),
            dish("계란컵밥오믈렛", 10, "남은 컵밥을 계란으로 묶어 팬에 굽습니다.", ["계란"]),
            dish("김치컵밥볶음", 9, "느끼한 맛을 김치로 잡아줍니다.", ["김치"])
          ]),
          foodItem("nurungji", "누룽지", ["누룽지", "계란", "대파", "국간장", "김치"], "부담 없는 야식이나 아침으로 활용", [
            dish("계란누룽지탕", 10, "누룽지를 부드럽게 끓이고 계란을 풀어 넣습니다.", ["계란"]),
            dish("김치누룽지죽", 12, "신김치를 넣으면 간이 빨리 잡힙니다.", ["김치"]),
            dish("참치누룽지죽", 12, "참치캔을 넣어 단백질을 보강합니다.", ["참치캔"])
          ])
        ]
      },
      {
        id: "noodle",
        label: "면",
        description: "라면, 우동, 파스타",
        items: [
          foodItem("bag-ramen", "봉지라면", ["봉지라면", "계란", "대파", "떡", "만두"], "라면에 남은 재료를 추가", [
            dish("계란파라면", 7, "라면에 계란과 대파를 더해 끓입니다.", ["계란", "대파"]),
            dish("만두라면전골", 12, "냉동만두를 넣으면 한 냄비 식사가 됩니다.", ["냉동만두"]),
            dish("떡라면", 9, "라면에 떡국떡을 더해 끓입니다.", ["떡국떡"])
          ]),
          foodItem("cup-ramen", "컵라면", ["컵라면", "삼각김밥", "치즈", "계란", "김치"], "컵라면을 한 끼 식사로 확장", [
            dish("치즈컵라면", 5, "치즈 한 장으로 간단히 변화를 줍니다.", ["치즈"]),
            dish("컵라면볶음밥", 10, "면을 부숴 밥과 볶으면 남김 없이 먹을 수 있습니다.", ["즉석밥"]),
            dish("김치컵라면죽", 9, "국물에 밥과 김치를 넣어 마무리합니다.", ["김치", "즉석밥"])
          ]),
          foodItem("frozen-udon", "냉동우동", ["냉동우동", "어묵", "계란", "대파", "쯔유"], "냉동우동을 국물 또는 볶음으로 활용", [
            dish("어묵우동", 10, "어묵을 넣으면 별도 육수 없이도 맛이 납니다.", ["어묵"]),
            dish("계란카레우동", 12, "레토르트 카레에 우동과 계란을 넣어 끓입니다.", ["카레"]),
            dish("김치볶음우동", 11, "김치와 면을 볶아 야식 메뉴로 좋습니다.", ["김치"])
          ])
        ]
      },
      {
        id: "bread-ricecake",
        label: "빵/떡",
        description: "식빵, 또띠아, 떡",
        items: [
          foodItem("bread", "식빵", ["식빵", "계란", "치즈", "햄", "양배추"], "아침과 야식 모두 가능한 기본 재료", [
            dish("계란토스트", 10, "계란물을 묻힌 식빵을 팬에서 익혀 포갭니다.", ["계란"]),
            dish("햄치즈토스트", 8, "슬라이스 햄과 치즈로 편의점식 한 끼가 됩니다.", ["햄", "치즈"]),
            dish("양배추토스트", 12, "남은 양배추를 빠르게 처리하기 좋습니다.", ["양배추"])
          ]),
          foodItem("tortilla", "또띠아", ["또띠아", "치즈", "햄", "닭가슴살", "양파"], "팬 하나로 랩이나 피자처럼 사용", [
            dish("또띠아피자", 12, "토마토소스와 치즈를 올리면 오븐 없이도 됩니다.", ["토마토소스"]),
            dish("닭가슴살랩", 10, "냉장 단백질을 싸서 깔끔하게 먹습니다.", ["닭가슴살"]),
            dish("햄치즈퀘사디아", 9, "접어서 굽기만 하면 되는 빠른 메뉴입니다.", ["햄", "치즈"])
          ]),
          foodItem("rice-cake", "떡국떡", ["떡국떡", "계란", "어묵", "고추장", "대파"], "냉동 보관 후 분식 메뉴로 전환", [
            dish("간단떡국", 12, "떡국떡을 끓이고 계란을 풀어 넣어 익힙니다.", ["계란"]),
            dish("어묵떡볶이", 15, "고추장과 어묵으로 분식집 맛을 냅니다.", ["어묵"]),
            dish("라볶이", 14, "라면과 떡을 함께 넣어 한 끼로 만듭니다.", ["봉지라면"])
          ])
        ]
      }
    ]
  },
  {
    id: "frozen",
    label: "냉동/간편식",
    description: "만두, 튀김, 냉동 한 끼",
    children: [
      {
        id: "dumpling-snack",
        label: "만두/분식",
        description: "냉동만두와 분식 재료",
        items: [
          foodItem("frozen-dumpling", "냉동만두", ["냉동만두", "라면", "대파", "계란", "양배추"], "굽기, 국물, 전골로 모두 활용", [
            dish("만두라면", 10, "라면과 냉동만두를 각각의 표시 시간에 맞춰 끓입니다.", ["봉지라면"]),
            dish("만두계란국", 12, "계란국에 만두를 넣으면 반찬 없이도 됩니다.", ["계란"]),
            dish("비빔만두", 14, "양배추와 초고추장을 곁들이면 술안주 겸 식사가 됩니다.", ["양배추"])
          ]),
          foodItem("fishcake", "어묵", ["어묵", "우동", "떡국떡", "대파", "간장"], "국물과 볶음 양쪽에 쓰기 좋음", [
            dish("어묵우동", 10, "쯔유 국물에 어묵과 우동을 넣어 끓입니다.", ["냉동우동"]),
            dish("어묵볶음밥", 12, "잘게 썬 어묵으로 밥을 볶습니다.", ["즉석밥"]),
            dish("어묵떡볶이", 15, "떡과 어묵을 고추장 양념에 넣어 졸입니다.", ["떡국떡"])
          ]),
          foodItem("tteokbokki-kit", "떡볶이키트", ["떡볶이키트", "어묵", "라면사리", "삶은계란", "대파"], "냉장고 재료를 토핑으로 추가", [
            dish("라볶이", 12, "라면사리를 넣어 한 끼 양으로 늘립니다.", ["라면사리"]),
            dish("어묵떡볶이", 10, "어묵을 추가하면 국물 맛이 깊어집니다.", ["어묵"]),
            dish("계란떡볶이덮밥", 15, "남은 소스를 밥 위에 얹어 마무리합니다.", ["즉석밥", "계란"])
          ])
        ]
      },
      {
        id: "fried",
        label: "튀김/육가공",
        description: "돈가스, 너겟, 떡갈비",
        items: [
          foodItem("nugget", "치킨너겟", ["치킨너겟", "식빵", "양배추", "치즈", "또띠아"], "간단한 단백질 토핑으로 사용", [
            dish("너겟토스트", 10, "식빵 사이에 너겟과 치즈를 넣습니다.", ["식빵"]),
            dish("너겟샐러드랩", 12, "또띠아에 채소와 너겟을 싸면 깔끔합니다.", ["또띠아"]),
            dish("너겟마요덮밥", 10, "잘게 썬 너겟을 밥 위에 올립니다.", ["즉석밥", "마요네즈"])
          ]),
          foodItem("pork-cutlet", "냉동돈가스", ["냉동돈가스", "즉석밥", "계란", "양파", "카레"], "밥 메뉴에 올리기 쉬운 메인", [
            dish("돈가스덮밥", 15, "양파와 계란을 곁들이면 외식 느낌이 납니다.", ["계란", "양파"]),
            dish("돈가스카레", 15, "익힌 돈가스를 카레밥 위에 올립니다.", ["카레"]),
            dish("돈가스샌드", 12, "식빵과 소스로 빠르게 도시락처럼 만듭니다.", ["식빵"])
          ]),
          foodItem("hamburg-steak", "떡갈비", ["떡갈비", "즉석밥", "계란", "양파", "치즈"], "밥 위에 올리면 바로 메인 반찬", [
            dish("떡갈비덮밥", 10, "밥 위에 떡갈비와 계란을 올립니다.", ["계란"]),
            dish("치즈떡갈비", 8, "팬에서 익힌 떡갈비에 치즈를 올려 녹입니다.", ["치즈"]),
            dish("떡갈비볶음밥", 12, "잘게 썰어 볶음밥 재료로 씁니다.", ["즉석밥"])
          ])
        ]
      },
      {
        id: "frozen-meal",
        label: "냉동 한 끼",
        description: "볶음밥, 피자, 야채",
        items: [
          foodItem("frozen-fried-rice", "냉동볶음밥", ["냉동볶음밥", "계란", "김치", "치즈", "대파"], "토핑을 더해 한 끼 완성도를 높임", [
            dish("계란볶음밥", 8, "냉동볶음밥에 완전히 익힌 계란을 섞습니다.", ["계란"]),
            dish("김치치즈볶음밥", 10, "김치와 치즈를 더해 느끼함을 줄입니다.", ["김치", "치즈"]),
            dish("볶음밥오믈렛", 12, "계란으로 감싸면 남은 볶음밥도 새 메뉴가 됩니다.", ["계란"])
          ]),
          foodItem("frozen-pizza", "냉동피자", ["냉동피자", "양파", "콘", "치즈", "핫소스"], "토핑 보강으로 배달 피자 대체", [
            dish("콘치즈피자", 10, "옥수수와 치즈를 추가해 양을 늘립니다.", ["콘", "치즈"]),
            dish("양파핫소스피자", 9, "양파를 얇게 올려 느끼함을 잡습니다.", ["양파"]),
            dish("피자토스트", 8, "남은 조각을 식빵 위 토핑처럼 씁니다.", ["식빵"])
          ]),
          foodItem("frozen-vegetable", "냉동야채", ["냉동야채", "즉석밥", "계란", "카레", "파스타면"], "채소 손질 없이 메뉴에 추가", [
            dish("야채계란볶음밥", 10, "냉동야채와 계란을 익힌 뒤 밥과 함께 볶습니다.", ["계란"]),
            dish("야채카레", 12, "레토르트 카레에 채소를 추가합니다.", ["카레"]),
            dish("야채크림파스타", 15, "파스타에 채소를 바로 넣어 조리합니다.", ["파스타면"])
          ])
        ]
      }
    ]
  },
  {
    id: "retort",
    label: "캔/레토르트",
    description: "참치, 햄, 소스",
    children: [
      {
        id: "canned-protein",
        label: "캔 단백질",
        description: "참치와 햄",
        items: [
          foodItem("tuna-can", "참치캔", ["참치캔", "즉석밥", "마요네즈", "김치", "계란"], "밥, 김치, 계란과 조합이 좋음", [
            dish("참치마요덮밥", 8, "참치와 마요네즈를 섞어 밥에 올리고 간장으로 간합니다.", ["마요네즈"]),
            dish("참치김치찌개", 15, "신김치와 끓이면 국물 메뉴가 됩니다.", ["김치"]),
            dish("참치계란전", 12, "계란과 섞어 팬에 부치면 반찬이 됩니다.", ["계란"])
          ]),
          foodItem("spam", "스팸/햄", ["스팸", "즉석밥", "계란", "김치", "식빵"], "짠맛이 있어 간단한 메인으로 적합", [
            dish("스팸마요덮밥", 10, "밥 위에 햄과 계란을 올립니다.", ["계란", "마요네즈"]),
            dish("스팸김치볶음밥", 12, "김치와 햄의 짠맛이 잘 맞습니다.", ["김치"]),
            dish("햄치즈토스트", 8, "식빵과 치즈로 빠른 아침이 됩니다.", ["식빵", "치즈"])
          ]),
          foodItem("chicken-breast", "닭가슴살팩", ["닭가슴살팩", "또띠아", "양배추", "파스타면", "즉석밥"], "운동식과 일반식 모두 전환 가능", [
            dish("닭가슴살랩", 10, "또띠아와 채소로 간단히 싸 먹습니다.", ["또띠아"]),
            dish("닭가슴살볶음밥", 12, "밥과 냉동야채를 넣어 볶습니다.", ["즉석밥"]),
            dish("닭가슴살파스타", 15, "소스와 면만 있으면 단백질 파스타가 됩니다.", ["파스타면"])
          ])
        ]
      },
      {
        id: "sauce",
        label: "소스/탕",
        description: "카레, 짜장, 토마토",
        items: [
          foodItem("retort-curry", "레토르트 카레", ["레토르트 카레", "즉석밥", "계란", "돈가스", "냉동야채"], "토핑을 올리면 바로 외식 대체", [
            dish("계란카레밥", 8, "계란 프라이만 올려도 든든합니다.", ["계란"]),
            dish("돈가스카레", 15, "냉동돈가스를 올리면 메인 메뉴가 됩니다.", ["냉동돈가스"]),
            dish("야채카레우동", 12, "우동면에 부으면 면 요리로 바뀝니다.", ["냉동우동"])
          ]),
          foodItem("retort-jjajang", "레토르트 짜장", ["레토르트 짜장", "즉석밥", "계란", "우동면", "양파"], "밥과 면 모두에 바로 사용", [
            dish("짜장밥", 7, "데운 밥에 뜨거운 짜장소스를 붓습니다.", ["즉석밥"]),
            dish("짜장우동", 10, "우동면에 비비면 간단한 면 메뉴가 됩니다.", ["냉동우동"]),
            dish("계란짜장덮밥", 9, "계란을 더해 단백질을 보강합니다.", ["계란"])
          ]),
          foodItem("tomato-sauce", "토마토소스", ["토마토소스", "파스타면", "또띠아", "치즈", "양파"], "파스타와 또띠아 피자에 사용", [
            dish("토마토파스타", 15, "면과 소스만 있으면 기본 메뉴가 됩니다.", ["파스타면"]),
            dish("또띠아피자", 12, "또띠아에 소스와 치즈를 올립니다.", ["또띠아"]),
            dish("토마토계란볶음", 10, "계란과 볶아 밥반찬으로 씁니다.", ["계란"])
          ])
        ]
      },
      {
        id: "fish-can",
        label: "생선/안주 캔",
        description: "골뱅이, 꽁치, 고등어",
        items: [
          foodItem("whelk-can", "골뱅이캔", ["골뱅이캔", "소면", "양배추", "오이", "초고추장"], "야식과 반찬으로 모두 활용", [
            dish("골뱅이소면", 15, "소면과 초고추장으로 바로 완성됩니다.", ["소면"]),
            dish("골뱅이무침밥", 10, "남은 무침을 밥 위에 올립니다.", ["즉석밥"]),
            dish("골뱅이양배추무침", 12, "양배추를 많이 처리하기 좋습니다.", ["양배추"])
          ]),
          foodItem("saury-can", "꽁치캔", ["꽁치캔", "김치", "두부", "대파", "즉석밥"], "김치와 끓이면 찌개가 빠름", [
            dish("꽁치김치찌개", 15, "김치를 물에 끓인 뒤 꽁치캔 건더기를 넣습니다.", ["김치"]),
            dish("꽁치조림덮밥", 12, "양념을 졸여 밥 위에 올립니다.", ["즉석밥"]),
            dish("꽁치두부조림", 15, "두부를 넣어 짠맛을 잡습니다.", ["두부"])
          ]),
          foodItem("mackerel-can", "고등어캔", ["고등어캔", "김치", "무", "대파", "즉석밥"], "조림이나 찌개로 빠르게 전환", [
            dish("고등어김치조림", 15, "김치와 함께 졸이면 밥반찬이 됩니다.", ["김치"]),
            dish("고등어무조림", 18, "무가 있으면 국물이 시원해집니다.", ["무"]),
            dish("고등어덮밥", 10, "캔 고등어를 데워 밥 위에 올립니다.", ["즉석밥"])
          ])
        ]
      }
    ]
  },
  {
    id: "banchan",
    label: "반찬/김치",
    description: "밑반찬과 절임",
    children: [
      {
        id: "kimchi",
        label: "김치류",
        description: "볶음, 찌개, 덮밥",
        items: [
          foodItem("cabbage-kimchi", "배추김치", ["배추김치", "즉석밥", "참치캔", "두부", "계란"], "익은 김치를 볶음과 찌개로 활용", [
            dish("김치볶음밥", 10, "김치를 볶고 밥을 넣은 뒤 참기름으로 마무리합니다.", ["즉석밥"]),
            dish("참치김치찌개", 15, "참치캔을 넣어 국물 메뉴로 만듭니다.", ["참치캔"]),
            dish("두부김치", 12, "두부를 데워 곁들이면 반찬 겸 식사입니다.", ["두부"])
          ]),
          foodItem("kkakdugi", "깍두기", ["깍두기", "즉석밥", "계란", "라면", "참기름"], "국물과 밥 메뉴에 잘 맞음", [
            dish("깍두기볶음밥", 10, "잘게 썰어 볶으면 식감이 좋습니다.", ["즉석밥"]),
            dish("깍두기라면", 8, "라면에 넣어 시원한 맛을 더합니다.", ["봉지라면"]),
            dish("깍두기계란밥", 7, "계란밥에 잘게 썬 깍두기를 올립니다.", ["계란"])
          ]),
          foodItem("yeolmu-kimchi", "열무김치", ["열무김치", "소면", "즉석밥", "계란", "참기름"], "비빔 메뉴에 바로 사용", [
            dish("열무비빔밥", 8, "밥에 열무김치와 고추장, 참기름을 넣어 비빕니다.", ["즉석밥"]),
            dish("열무국수", 12, "소면을 삶아 시원한 한 끼로 만듭니다.", ["소면"]),
            dish("열무계란비빔밥", 10, "계란을 올려 단백질을 보강합니다.", ["계란"])
          ])
        ]
      },
      {
        id: "dry-banchan",
        label: "밑반찬",
        description: "장조림, 멸치, 진미채",
        items: [
          foodItem("jangjorim", "장조림", ["장조림", "즉석밥", "계란", "버터", "김가루"], "짭짤한 소스로 밥 메뉴에 적합", [
            dish("장조림버터밥", 7, "장조림 국물과 버터로 빠르게 비빕니다.", ["버터"]),
            dish("장조림계란덮밥", 10, "계란과 함께 덮밥으로 만듭니다.", ["계란"]),
            dish("장조림주먹밥", 8, "잘게 찢어 김가루와 뭉칩니다.", ["김가루"])
          ]),
          foodItem("anchovy", "멸치볶음", ["멸치볶음", "즉석밥", "계란", "김가루", "고추장"], "주먹밥과 비빔밥에 활용", [
            dish("멸치주먹밥", 8, "멸치볶음과 김가루를 넣어 뭉칩니다.", ["김가루"]),
            dish("멸치계란볶음밥", 10, "계란과 볶아 짭짤한 볶음밥을 만듭니다.", ["계란"]),
            dish("멸치고추장비빔밥", 8, "고추장과 참기름으로 빠르게 비빕니다.", ["고추장"])
          ]),
          foodItem("jinmichae", "진미채", ["진미채", "즉석밥", "마요네즈", "김가루", "계란"], "매콤한 밥 토핑으로 사용", [
            dish("진미채마요덮밥", 8, "마요네즈를 더해 매운맛을 부드럽게 합니다.", ["마요네즈"]),
            dish("진미채주먹밥", 9, "잘게 썰어 김가루와 뭉칩니다.", ["김가루"]),
            dish("진미채계란밥", 8, "계란밥에 토핑으로 올립니다.", ["계란"])
          ])
        ]
      },
      {
        id: "namul-pickle",
        label: "나물/절임",
        description: "콩나물, 단무지, 무말랭이",
        items: [
          foodItem("bean-sprout", "콩나물무침", ["콩나물무침", "즉석밥", "계란", "고추장", "참기름"], "비빔밥과 국물에 바로 사용", [
            dish("콩나물비빔밥", 8, "고추장과 참기름으로 바로 비빕니다.", ["고추장"]),
            dish("콩나물라면", 8, "라면에 넣으면 국물이 시원해집니다.", ["봉지라면"]),
            dish("콩나물계란국", 10, "계란을 풀어 가벼운 국으로 만듭니다.", ["계란"])
          ]),
          foodItem("danmuji", "단무지", ["단무지", "즉석밥", "김", "참치캔", "마요네즈"], "주먹밥과 김밥 맛을 빠르게 냄", [
            dish("단무지참치주먹밥", 8, "잘게 썬 단무지와 참치를 섞습니다.", ["참치캔"]),
            dish("단무지마요밥", 7, "마요네즈와 김가루로 간단히 비빕니다.", ["마요네즈"]),
            dish("꼬마김밥식 비빔밥", 10, "김과 밥을 함께 비벼 김밥 맛을 냅니다.", ["김"])
          ]),
          foodItem("dried-radish", "무말랭이", ["무말랭이", "즉석밥", "참치캔", "계란", "김가루"], "꼬들한 식감이 밥 메뉴에 좋음", [
            dish("무말랭이비빔밥", 8, "밥 위에 올리고 참기름으로 비빕니다.", ["즉석밥"]),
            dish("무말랭이참치밥", 8, "양념한 무말랭이 반찬과 참치마요를 밥에 올립니다.", ["참치캔"]),
            dish("무말랭이주먹밥", 9, "잘게 썰어 김가루와 뭉칩니다.", ["김가루"])
          ])
        ]
      }
    ]
  },
  {
    id: "fresh",
    label: "신선채소/과일",
    description: "샐러드, 볶음, 아침 대용",
    children: [
      {
        id: "leafy-vegetable",
        label: "잎채소",
        description: "양배추, 상추, 깻잎",
        items: [
          foodItem("cabbage", "양배추", ["양배추", "계란", "즉석밥", "참치캔", "고추장"], "쌈, 볶음, 덮밥에 모두 활용", [
            dish("양배추계란덮밥", 12, "채 썬 양배추와 계란을 볶아 밥 위에 올립니다.", ["계란", "즉석밥"]),
            dish("참치양배추쌈", 10, "찐 양배추에 밥과 참치, 쌈장을 넣어 쌉니다.", ["참치캔"]),
            dish("양배추고추장볶음", 9, "시들기 전 빠르게 볶아 반찬으로 씁니다.", ["고추장"])
          ]),
          foodItem("lettuce", "상추", ["상추", "즉석밥", "참치캔", "계란", "쌈장"], "밥과 단백질을 싸서 빠른 한 끼", [
            dish("참치상추비빔밥", 8, "상추를 찢어 참치와 비비면 바로 한 그릇입니다.", ["참치캔", "즉석밥"]),
            dish("계란상추쌈밥", 10, "계란 프라이와 밥을 상추에 싸 먹습니다.", ["계란"]),
            dish("상추겉절이덮밥", 8, "간단히 무쳐 밥 위에 올립니다.", ["즉석밥"])
          ]),
          foodItem("perilla-leaf", "깻잎", ["깻잎", "즉석밥", "참치캔", "간장", "김가루"], "향이 강해 밥 메뉴 풍미 보강", [
            dish("깻잎참치덮밥", 8, "참치와 깻잎을 올려 느끼함을 줄입니다.", ["참치캔"]),
            dish("깻잎간장비빔밥", 7, "간장과 참기름만 더해도 향이 살아납니다.", ["간장"]),
            dish("깻잎주먹밥", 9, "잘게 썰어 김가루와 함께 뭉칩니다.", ["김가루"])
          ])
        ]
      },
      {
        id: "root-vegetable",
        label: "뿌리/단단한 채소",
        description: "감자, 당근, 양파",
        items: [
          foodItem("potato", "감자", ["감자", "계란", "즉석밥", "카레", "치즈"], "볶음과 카레에 쓰기 좋은 주재료", [
            dish("감자계란볶음", 12, "얇게 썬 감자와 계란을 볶아 반찬으로 씁니다.", ["계란"]),
            dish("감자카레밥", 15, "레토르트 카레에 감자를 더해 양을 늘립니다.", ["카레", "즉석밥"]),
            dish("치즈감자구이", 14, "전자레인지로 익힌 뒤 치즈를 올립니다.", ["치즈"])
          ]),
          foodItem("carrot", "당근", ["당근", "계란", "즉석밥", "라면", "카레"], "잘게 썰어 색과 단맛을 보강", [
            dish("당근계란볶음밥", 10, "잘게 썬 당근으로 볶음밥 식감을 살립니다.", ["계란", "즉석밥"]),
            dish("당근라면", 8, "라면에 채 썬 당근을 넣어 단맛을 더합니다.", ["봉지라면"]),
            dish("당근카레", 12, "카레에 넣으면 재료가 부족해도 든든합니다.", ["카레"])
          ]),
          foodItem("onion", "양파", ["양파", "즉석밥", "계란", "돈가스", "간장"], "대부분의 덮밥과 볶음에 기본으로 사용", [
            dish("양파계란덮밥", 10, "간장 양념에 양파와 계란을 익힙니다.", ["계란", "즉석밥"]),
            dish("돈가스양파덮밥", 15, "냉동돈가스에 양파를 더해 한 그릇으로 만듭니다.", ["냉동돈가스"]),
            dish("양파간장볶음", 8, "양파만 남았을 때 밥반찬으로 빠르게 처리합니다.", ["간장"])
          ])
        ]
      }
    ]
  },
  {
    id: "quick-protein",
    label: "간편 단백질",
    description: "계란, 두부, 유제품",
    children: [
      {
        id: "egg-tofu",
        label: "계란/두부",
        description: "냉장고 기본 단백질",
        items: [
          foodItem("egg", "계란", ["계란", "즉석밥", "김치", "간장", "대파"], "팬이나 냄비에서 익혀 쓰는 기본 재료", [
            dish("간장계란밥", 5, "밥 위에 계란과 간장을 올리는 기본 절약 메뉴입니다.", ["즉석밥", "간장"]),
            dish("김치계란볶음밥", 10, "김치와 밥을 볶은 뒤 완전히 익힌 계란을 섞습니다.", ["김치"]),
            dish("대파계란국", 8, "대파를 넣어 간단한 국으로 만듭니다.", ["대파"])
          ]),
          foodItem("tofu", "두부", ["두부", "김치", "계란", "간장", "즉석밥"], "소비기한 임박 재료를 처리하기 좋음", [
            dish("두부김치", 12, "두부를 데우고 김치를 볶아 곁들입니다.", ["김치"]),
            dish("두부계란부침", 10, "계란물을 입혀 부치면 반찬이 됩니다.", ["계란"]),
            dish("두부간장덮밥", 9, "으깬 두부를 간장에 볶아 밥 위에 올립니다.", ["즉석밥", "간장"])
          ]),
          foodItem("soft-tofu", "순두부", ["순두부", "계란", "라면", "김치", "대파"], "국물 메뉴를 빠르게 든든하게 만듦", [
            dish("순두부라면", 8, "라면에 순두부를 넣어 한 끼로 만듭니다.", ["봉지라면"]),
            dish("김치순두부찌개", 12, "김치와 순두부를 끓이고 고춧가루와 국간장으로 간합니다.", ["김치"]),
            dish("계란순두부국", 10, "계란을 풀어 부드러운 국으로 먹습니다.", ["계란"])
          ])
        ]
      },
      {
        id: "dairy",
        label: "유제품/치즈",
        description: "치즈, 우유, 요거트",
        items: [
          foodItem("cheese", "치즈", ["치즈", "즉석밥", "김치", "라면", "또띠아"], "남은 메뉴를 더 든든하게 바꿈", [
            dish("치즈김치밥", 8, "김치볶음밥 위에 치즈를 녹입니다.", ["김치", "즉석밥"]),
            dish("치즈라면", 6, "라면에 치즈 한 장으로 고소함을 더합니다.", ["봉지라면"]),
            dish("또띠아치즈롤", 8, "또띠아에 치즈를 넣고 접어 굽습니다.", ["또띠아"])
          ]),
          foodItem("milk", "우유", ["우유", "파스타면", "치즈", "계란", "식빵"], "소스나 아침 대용으로 활용", [
            dish("우유크림파스타", 15, "우유와 치즈로 간단한 크림 소스를 만듭니다.", ["파스타면", "치즈"]),
            dish("프렌치토스트", 10, "식빵과 계란, 우유로 아침을 해결합니다.", ["식빵", "계란"]),
            dish("우유계란찜", 9, "계란찜에 우유를 조금 넣어 부드럽게 만듭니다.", ["계란"])
          ]),
          foodItem("yogurt", "요거트", ["요거트", "바나나", "시리얼", "견과류", "식빵"], "아침과 간식으로 빠르게 처리", [
            dish("요거트볼", 5, "시리얼과 견과류를 올려 바로 먹습니다.", ["시리얼", "견과류"]),
            dish("바나나요거트", 5, "차가운 요거트에 썬 바나나를 올립니다.", ["바나나"]),
            dish("요거트토스트", 7, "식빵에 요거트를 바르고 과일을 올립니다.", ["식빵"])
          ])
        ]
      }
    ]
  }
];

export function foodItem(id, name, ingredients, priorityNote, recipes) {
  const sourceRefs = storageSourceRefs(id, name);
  const item = {
    id,
    name,
    aliases: ingredientAliases(name),
    ingredients: uniqueNames(ingredients),
    priorityNote,
    reviewedAt: CATALOG_REVIEWED_AT,
    sourceRefs,
    sourceScope: "보관·식품 안전 안내의 근거입니다. 제품 라벨과 실제 상태를 우선하세요.",
    details: buildIngredientDetails(id, name, priorityNote),
    recipes: []
  };
  item.recipes = recipes.map((recipe, index) => expandRecipe(item, recipe, index));
  return item;
}

export function dish(name, cookTimeMinutes, reason, extraIngredients = []) {
  return { name, cookTimeMinutes, reason, extraIngredients: uniqueNames(extraIngredients) };
}

function expandRecipe(item, recipe, index) {
  const spec = getRecipeSpec(item.id, index);
  if (!spec) throw new Error(`Missing explicit recipe specification: ${item.id}:${index}`);
  const sourceRefs = [...new Set(spec.sourceRefs || recipeSourceRefs(recipe.name))];
  const hasMethodSource = sourceRefs.some(isMethodSourceRef);
  return {
    id: `${item.id}-${index + 1}`,
    name: recipe.name,
    reason: recipe.reason,
    cookTimeMinutes: spec.cookTimeMinutes,
    difficulty: spec.cookTimeMinutes <= 10 ? "easy" : spec.cookTimeMinutes <= 20 ? "medium" : "hard",
    servings: spec.servings,
    requiredIngredients: spec.requiredIngredients,
    optionalIngredients: spec.optionalIngredients,
    equipment: spec.equipment,
    steps: spec.steps,
    doneness: spec.doneness,
    sourceRefs,
    reviewedAt: CATALOG_REVIEWED_AT,
    adaptationNote: spec.adaptationNote,
    estimateNote: "분량과 시간은 앱의 1인분 조리안이며 실제 주방 조리로 검증한 표준값이 아닙니다. 제품 크기와 화력에 따라 달라질 수 있습니다.",
    sourceScope: hasMethodSource
      ? "표시된 요리 자료는 핵심 조리 흐름만 참고했습니다. 분량과 문장은 앱에서 새로 구성했으며, 식품 안전 자료는 레시피 맛 검증 근거가 아닙니다."
      : "식품 안전 자료는 온도·보관 원칙의 근거이며 이 레시피의 맛이나 완성도를 검증한 출처가 아닙니다."
  };
}

function ingredientAmount(name, required) {
  if (/즉석밥|컵밥/.test(name)) return "1개(약 200g)";
  if (/밥/.test(name)) return "1공기(약 200g)";
  if (/계란|달걀/.test(name)) return required ? "1개" : "1개(선택)";
  if (/라면|우동|파스타면|소면|라면사리/.test(name)) return "1인분";
  if (/식빵/.test(name)) return "2장";
  if (/또띠아/.test(name)) return "1장";
  if (/순두부/.test(name)) return "1/2봉(약 175g)";
  if (/두부/.test(name)) return "150g";
  if (/캔|스팸|햄|닭가슴살|돈가스|떡갈비|너겟|만두|피자/.test(name)) return "1/2팩 또는 100g";
  if (/치즈/.test(name)) return "1장 또는 30g";
  if (/우유|요거트/.test(name)) return "150ml 또는 150g";
  if (/김치|깍두기|무말랭이|단무지|장조림|멸치볶음|진미채|콩나물무침/.test(name)) return "1/2컵(약 80g)";
  if (/감자|당근|양파|양배추|상추|깻잎|대파|무|오이|냉동야채/.test(name)) return "1/2컵(약 70g)";
  if (/간장|고추장|쌈장|마요네즈|참기름|초고추장|핫소스/.test(name)) return "1큰술";
  if (/김가루|견과류/.test(name)) return "1큰술";
  return required ? "1인분" : "기호에 따라";
}

function buildIngredientDetails(id, name, priorityNote) {
  const group = ingredientGuidanceGroup(id);
  const guidance = ingredientGuidance(group);
  return {
    summary: priorityNote,
    storage: id === "spam"
      ? "제품 형태와 포장 표시를 먼저 확인합니다. 상온 보관 캔은 미개봉 상태로 서늘하고 건조한 곳에 두고, 냉장 햄은 표시대로 냉장합니다. 개봉 뒤에는 밀폐해 4°C 이하에 두고 제품 표시 기한 안에 사용합니다."
      : guidance.storage,
    safety: ["instant-rice", "cup-rice"].includes(id)
      ? "미개봉 제품은 포장 표시를 따릅니다. 조리 뒤 남은 밥은 작게 나눠 가급적 1시간 안에 식혀 냉장하고 24시간 안에 먹습니다. 재가열은 한 번만 하고 중심까지 김이 나게 데웁니다."
      : id === "spam"
      ? "캔이 심하게 찌그러졌거나 새거나 부풀었다면 열거나 맛보지 말고 버립니다. 햄은 완전가열 제품인지 확인하고 포장에 재가열 또는 중심온도 지시가 있으면 그대로 따릅니다."
      : /계란/.test(name)
      ? "달걀의 물에 뜨는 정도는 안전 검사가 아닙니다. 흰자와 노른자를 단단하게 익히고, 섞은 달걀 요리는 중심 71°C를 확인합니다."
      : /닭|너겟/.test(name)
        ? "닭가슴살팩과 너겟은 생제품·가열제품 여부가 다를 수 있으므로 라벨을 확인합니다. 생가금류라면 씻지 않고 중심 74°C까지 익힙니다."
        : guidance.safety,
    servingGuide: `1인분에는 ${ingredientAmount(name, true)} 정도를 기준으로 시작하세요.`
  };
}

function storageSourceRefs(id, name) {
  if (id === "potato") return ["bfr-potato", "food-safety-four-steps"];
  if (id === "onion") return ["onions-usa-storage", "food-safety-four-steps"];
  if (id === "carrot") return ["unl-carrot", "food-safety-four-steps"];
  if (["bread", "tortilla"].includes(id)) return ["unl-food-storage", "usda-mold", "food-safety-four-steps"];
  if (id === "spam") return ["usda-shelf-stable", "unl-food-storage", "food-safety-four-steps"];
  if (/캔/.test(name)) return ["usda-shelf-stable", "food-safety-four-steps"];
  if (["instant-rice", "cup-rice"].includes(id)) return ["fsa-rice", "food-safety-four-steps"];
  if (["bread", "bag-ramen", "cup-ramen", "nurungji"].includes(id)) return ["unl-food-storage", "food-safety-four-steps"];
  if (/우유|요거트/.test(name)) return ["fsa-rice", "food-safety-four-steps"];
  if (/계란/.test(name)) return ["fsa-rice", "food-safety-temperatures", "food-safety-four-steps"];
  if (/닭|너겟/.test(name)) return ["food-safety-temperatures", "food-safety-four-steps"];
  return ["food-safety-four-steps"];
}

function recipeSourceRefs(name) {
  const refs = ["food-safety-four-steps"];
  if (/김치볶음밥/.test(name)) refs.push("maangchi-kimchi-fried-rice", "fsa-rice");
  if (/두부김치/.test(name)) refs.push("korean-bapsang-dubu-kimchi");
  if (/계란국/.test(name)) refs.push("10000recipe-egg-soup", "food-safety-temperatures");
  if (/계란|오믈렛|프렌치토스트/.test(name)) refs.push("food-safety-temperatures");
  if (/볶음밥|밥$/.test(name)) refs.push("fsa-rice");
  if (/골뱅이소면|열무국수/.test(name)) refs.push("maangchi-bibim-guksu");
  if (/파스타/.test(name)) refs.push("barilla-pasta");
  return [...new Set(refs)];
}

function isMethodSourceRef(ref) {
  return [
    "maangchi-kimchi-fried-rice", "korean-bapsang-dubu-kimchi", "10000recipe-egg-soup",
    "maangchi-bibim-guksu", "barilla-pasta", "maangchi-gamjajeon", "maangchi-gyeran-mari"
  ].includes(ref);
}

function ingredientGuidance(group) {
  const guidance = {
    frozen: {
    storage: "-18°C 이하에서 냉동하고 포장에 적힌 보관기한을 따릅니다. 냉장 해동하거나 제품 표시대로 냉동 상태에서 조리합니다.",
    safety: "해동한 제품은 다시 상온에 오래 두지 말고, 가열제품 여부와 조리 시간은 포장 표시를 확인합니다."
  },
  shelfDry: {
    storage: "미개봉은 포장 표시대로 서늘하고 건조한 곳에 둡니다. 개봉한 건조 식품은 밀폐해 습기와 해충을 피합니다.",
    safety: "포장이 젖거나 부풀었거나 손상됐으면 사용하지 않습니다. 조리 뒤 남은 음식은 2시간 안에 얕은 용기에 담아 냉장합니다."
  },
  bread: {
    storage: "표시된 기한과 보관법을 따릅니다. 며칠 안에 먹지 않을 식빵·또띠아는 밀폐해 냉동하면 품질 저하를 늦출 수 있습니다.",
    safety: "곰팡이가 보이면 보이는 부분만 떼지 말고 해당 빵 전체를 버립니다."
  },
  chilledPack: {
    storage: "냉장·냉동·상온 제품이 모두 있으므로 미개봉은 포장 표시를 우선합니다. 냉장 제품과 개봉한 제품은 4°C 이하에 두고 빠르게 사용합니다.",
    safety: "완전가열 제품인지 확인하고 포장에 재가열 또는 중심온도 지시가 있으면 그대로 따릅니다."
  },
  canned: {
    storage: "미개봉 캔은 서늘하고 건조한 곳에 둡니다. 개봉한 육류·생선 캔은 밀폐 용기에 옮겨 냉장하고 3~4일 안에 사용합니다.",
    safety: "심하게 찌그러졌거나 새거나 부푼 캔은 열거나 맛보지 말고 버립니다."
  },
  prepared: {
    storage: "4°C 이하에서 냉장하고 덜어 먹을 때 깨끗한 도구를 씁니다. 상온에 2시간 넘게 두지 않으며 32°C가 넘는 환경에서는 1시간 안에 냉장합니다.",
    safety: "이미 조리된 반찬이므로 생재료용 손질법을 적용하지 않습니다. 이상한 냄새·곰팡이·용기 팽창이 있으면 맛보지 말고 버립니다."
  },
  leafy: {
    storage: "씻지 않은 상태로 과한 물기를 피하고 냉장합니다. 손질하거나 씻은 뒤에는 물기를 빼 밀폐하고 빠르게 사용합니다.",
    safety: "먹기 직전에 흐르는 물로 씻고, 상한 잎과 흙을 제거한 뒤 깨끗한 도마와 칼을 사용합니다."
  },
  root: {
    storage: "당근 잎이 붙어 있으면 떼고 봉투에 넣어 4°C 이하에서 냉장합니다. 손질하거나 자른 뒤에는 밀폐해 냉장하고 빠르게 사용합니다.",
    safety: "흐르는 물에 씻고 상한 부분을 충분히 도려냅니다. 물러짐이나 곰팡이가 넓게 번졌다면 버립니다."
  },
  potato: {
    storage: "서늘하고 어둡고 건조한 곳에 보관합니다. 녹색으로 변했거나 강하게 싹이 났거나 심하게 쪼그라든 감자는 버립니다.",
    safety: "녹색 부분이나 강한 발아가 있는 감자를 가열만으로 안전하게 만들 수 있다고 보지 않습니다. 해당 감자는 사용하지 않습니다."
  },
  onion: {
    storage: "통양파는 서늘하고 건조하며 통풍되는 곳에 둡니다. 껍질을 벗기거나 자른 양파는 밀폐해 냉장합니다.",
    safety: "곰팡이, 물러짐, 새는 액체가 있으면 사용하지 않습니다. 자르기 전에 겉면의 흙을 제거하고 깨끗한 도구를 씁니다."
  },
  eggDairyTofu: {
    storage: "제품 표시대로 4°C 이하에서 냉장하고 소비기한을 지킵니다. 우유·요거트 같은 소비기한 식품은 냄새만으로 안전을 판단하지 않습니다.",
    safety: "상온에 2시간 넘게 두지 않으며 32°C가 넘는 환경에서는 1시간 안에 냉장합니다. 포장이 부풀거나 새면 사용하지 않습니다."
    }
  };
  return guidance[group];
}

function ingredientGuidanceGroup(id) {
  if (["frozen-udon", "frozen-dumpling", "nugget", "pork-cutlet", "frozen-fried-rice", "frozen-pizza", "frozen-vegetable"].includes(id)) return "frozen";
  if (["instant-rice", "cup-rice", "nurungji", "bag-ramen", "cup-ramen"].includes(id)) return "shelfDry";
  if (["bread", "tortilla"].includes(id)) return "bread";
  if (["rice-cake", "fishcake", "tteokbokki-kit", "hamburg-steak", "chicken-breast", "retort-curry", "retort-jjajang", "tomato-sauce"].includes(id)) return "chilledPack";
  if (["tuna-can", "spam", "whelk-can", "saury-can", "mackerel-can"].includes(id)) return "canned";
  if (["cabbage-kimchi", "kkakdugi", "yeolmu-kimchi", "jangjorim", "anchovy", "jinmichae", "bean-sprout", "danmuji", "dried-radish"].includes(id)) return "prepared";
  if (["cabbage", "lettuce", "perilla-leaf"].includes(id)) return "leafy";
  if (id === "potato") return "potato";
  if (id === "onion") return "onion";
  if (id === "carrot") return "root";
  return "eggDairyTofu";
}

export function ingredientAliases(name) {
  const key = ingredientKey(name);
  const group = Object.entries(ALIASES).find(([canonical, aliases]) =>
    [canonical, ...aliases].some((candidate) => ingredientKey(candidate) === key)
  );
  return group ? uniqueNames([group[0], ...group[1]]) : uniqueNames([name]);
}

export function ingredientKey(value) {
  return String(value || "").trim().toLocaleLowerCase("ko-KR").replace(/[\s/_-]+/g, "");
}

export function ingredientNamesMatch(left, right) {
  const leftAliases = ingredientAliases(left).map(ingredientKey);
  const rightAliases = ingredientAliases(right).map(ingredientKey);
  return leftAliases.some((key) => rightAliases.includes(key));
}

function ingredientListsMatch(names, candidate) {
  return names.some((name) => ingredientNamesMatch(name, candidate));
}

function uniqueNames(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = ingredientKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function flattenCatalog(catalog = FOOD_CATALOG) {
  return catalog.flatMap((major) => major.children.flatMap((medium) => medium.items.map((item) => ({ ...item, major: { id: major.id, label: major.label }, medium: { id: medium.id, label: medium.label } }))));
}

export function findCatalogItem(id) {
  return flattenCatalog().find((item) => item.id === id) || null;
}

export function getCatalogIngredientNames() {
  return [...new Set(flattenCatalog().flatMap((item) => [item.name, ...item.ingredients]))];
}
