const form = document.querySelector("#recommendForm");
const demoButton = document.querySelector("#demoButton");
const message = document.querySelector("#message");
const recipesContainer = document.querySelector("#recipes");
const aiStatus = document.querySelector("#aiStatus");
const dbStatus = document.querySelector("#dbStatus");
const authStatus = document.querySelector("#authStatus");
const bestSavings = document.querySelector("#bestSavings");
const deliveryCost = document.querySelector("#deliveryCost");
const homeCost = document.querySelector("#homeCost");
const savingsBarFill = document.querySelector("#savingsBarFill");
const priorityIngredients = document.querySelector("#priorityIngredients");
const authEntry = document.querySelector("#authEntry");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const sessionPanel = document.querySelector("#sessionPanel");
const accountEmail = document.querySelector("#accountEmail");
const accountName = document.querySelector("#accountName");
const authMessage = document.querySelector("#authMessage");
const logoutButton = document.querySelector("#logoutButton");
const pantryForm = document.querySelector("#pantryForm");
const pantryList = document.querySelector("#pantryList");
const usePantryButton = document.querySelector("#usePantryButton");
const historyList = document.querySelector("#historyList");
const totalSavings = document.querySelector("#totalSavings");
const majorCategories = document.querySelector("#majorCategories");
const mediumCategories = document.querySelector("#mediumCategories");
const smallCategories = document.querySelector("#smallCategories");
const selectedIngredientSummary = document.querySelector("#selectedIngredientSummary");
const categoryRecipes = document.querySelector("#categoryRecipes");
const applyCategoryButton = document.querySelector("#applyCategoryButton");
const requestCategoryButton = document.querySelector("#requestCategoryButton");

const CATEGORY_DATA = [
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
            dish("김치계란덮밥", 10, "김치와 계란만 더해도 배달 대체 한 끼가 됩니다.", ["대파"]),
            dish("참치마요밥", 8, "참치캔이나 마요네즈가 있으면 가장 빠르게 완성됩니다.", ["참치캔", "마요네즈"]),
            dish("간장버터계란밥", 7, "기본 양념만으로 조리 시간이 짧습니다.", ["버터", "간장"])
          ]),
          foodItem("cup-rice", "컵밥", ["컵밥", "계란", "치즈", "대파", "김치"], "컵밥에 단백질과 채소를 보강", [
            dish("치즈컵밥그라탕", 12, "컵밥 위에 치즈를 올려 든든하게 바꿉니다.", ["모짜렐라"]),
            dish("계란컵밥오믈렛", 10, "남은 컵밥을 계란으로 묶어 팬에 굽습니다.", ["계란"]),
            dish("김치컵밥볶음", 9, "느끼한 맛을 김치로 잡아줍니다.", ["김치"])
          ]),
          foodItem("nurungji", "누룽지", ["누룽지", "계란", "대파", "국간장", "김치"], "부담 없는 야식이나 아침으로 활용", [
            dish("계란누룽지탕", 10, "속이 편하고 설거지가 적은 메뉴입니다.", ["계란"]),
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
            dish("계란파라면", 7, "계란과 대파만 넣어도 만족도가 올라갑니다.", ["계란", "대파"]),
            dish("만두라면전골", 12, "냉동만두를 넣으면 한 냄비 식사가 됩니다.", ["냉동만두"]),
            dish("떡라면", 9, "떡을 넣어 포만감을 높입니다.", ["떡국떡"])
          ]),
          foodItem("cup-ramen", "컵라면", ["컵라면", "삼각김밥", "치즈", "계란", "김치"], "컵라면을 한 끼 식사로 확장", [
            dish("치즈컵라면", 5, "치즈 한 장으로 간단히 변화를 줍니다.", ["치즈"]),
            dish("컵라면볶음밥", 10, "면을 부숴 밥과 볶으면 남김 없이 먹을 수 있습니다.", ["즉석밥"]),
            dish("김치컵라면죽", 9, "국물에 밥과 김치를 넣어 마무리합니다.", ["김치", "즉석밥"])
          ]),
          foodItem("frozen-udon", "냉동우동", ["냉동우동", "어묵", "계란", "대파", "쯔유"], "냉동우동을 국물 또는 볶음으로 활용", [
            dish("어묵우동", 10, "어묵을 넣으면 별도 육수 없이도 맛이 납니다.", ["어묵"]),
            dish("계란카레우동", 12, "카레가루나 레토르트 카레로 진한 맛을 냅니다.", ["카레"]),
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
            dish("계란토스트", 10, "계란과 식빵만으로 바로 만들 수 있습니다.", ["계란"]),
            dish("햄치즈토스트", 8, "슬라이스 햄과 치즈로 편의점식 한 끼가 됩니다.", ["햄", "치즈"]),
            dish("양배추토스트", 12, "남은 양배추를 빠르게 처리하기 좋습니다.", ["양배추"])
          ]),
          foodItem("tortilla", "또띠아", ["또띠아", "치즈", "햄", "닭가슴살", "양파"], "팬 하나로 랩이나 피자처럼 사용", [
            dish("또띠아피자", 12, "토마토소스와 치즈를 올리면 오븐 없이도 됩니다.", ["토마토소스"]),
            dish("닭가슴살랩", 10, "냉장 단백질을 싸서 깔끔하게 먹습니다.", ["닭가슴살"]),
            dish("햄치즈퀘사디아", 9, "접어서 굽기만 하면 되는 빠른 메뉴입니다.", ["햄", "치즈"])
          ]),
          foodItem("rice-cake", "떡국떡", ["떡국떡", "계란", "어묵", "고추장", "대파"], "냉동 보관 후 분식 메뉴로 전환", [
            dish("간단떡국", 12, "계란과 대파만 더하면 국물 메뉴가 됩니다.", ["계란"]),
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
            dish("만두라면", 10, "라면에 냉동만두를 넣어 포만감을 높입니다.", ["봉지라면"]),
            dish("만두계란국", 12, "계란국에 만두를 넣으면 반찬 없이도 됩니다.", ["계란"]),
            dish("비빔만두", 14, "양배추와 초고추장을 곁들이면 술안주 겸 식사가 됩니다.", ["양배추"])
          ]),
          foodItem("fishcake", "어묵", ["어묵", "우동", "떡국떡", "대파", "간장"], "국물과 볶음 양쪽에 쓰기 좋음", [
            dish("어묵우동", 10, "냉동우동과 가장 잘 맞는 조합입니다.", ["냉동우동"]),
            dish("어묵볶음밥", 12, "잘게 썬 어묵으로 밥을 볶습니다.", ["즉석밥"]),
            dish("어묵떡볶이", 15, "떡과 어묵만 있어도 분식 메뉴가 됩니다.", ["떡국떡"])
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
            dish("돈가스카레", 15, "레토르트 카레와 조합하면 실패가 적습니다.", ["카레"]),
            dish("돈가스샌드", 12, "식빵과 소스로 빠르게 도시락처럼 만듭니다.", ["식빵"])
          ]),
          foodItem("hamburg-steak", "떡갈비", ["떡갈비", "즉석밥", "계란", "양파", "치즈"], "밥 위에 올리면 바로 메인 반찬", [
            dish("떡갈비덮밥", 10, "밥 위에 떡갈비와 계란을 올립니다.", ["계란"]),
            dish("치즈떡갈비", 8, "치즈를 올려 전자레인지로 마무리합니다.", ["치즈"]),
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
            dish("계란볶음밥", 8, "계란 프라이 하나로 만족도가 크게 오릅니다.", ["계란"]),
            dish("김치치즈볶음밥", 10, "김치와 치즈를 더해 느끼함을 줄입니다.", ["김치", "치즈"]),
            dish("볶음밥오믈렛", 12, "계란으로 감싸면 남은 볶음밥도 새 메뉴가 됩니다.", ["계란"])
          ]),
          foodItem("frozen-pizza", "냉동피자", ["냉동피자", "양파", "콘", "치즈", "핫소스"], "토핑 보강으로 배달 피자 대체", [
            dish("콘치즈피자", 10, "옥수수와 치즈를 추가해 양을 늘립니다.", ["콘", "치즈"]),
            dish("양파핫소스피자", 9, "양파를 얇게 올려 느끼함을 잡습니다.", ["양파"]),
            dish("피자토스트", 8, "남은 조각을 식빵 위 토핑처럼 씁니다.", ["식빵"])
          ]),
          foodItem("frozen-vegetable", "냉동야채", ["냉동야채", "즉석밥", "계란", "카레", "파스타면"], "채소 손질 없이 메뉴에 추가", [
            dish("야채계란볶음밥", 10, "냉동야채와 계란만으로 균형을 맞춥니다.", ["계란"]),
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
            dish("참치마요덮밥", 8, "마요네즈와 김가루만 있어도 완성됩니다.", ["마요네즈"]),
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
            dish("짜장밥", 7, "즉석밥과 함께 가장 빠른 한 끼입니다.", ["즉석밥"]),
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
            dish("꽁치김치찌개", 15, "김치와 꽁치캔 국물을 함께 끓입니다.", ["김치"]),
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
            dish("김치볶음밥", 10, "밥과 김치만 있어도 기본 한 끼가 됩니다.", ["즉석밥"]),
            dish("참치김치찌개", 15, "참치캔을 넣어 국물 메뉴로 만듭니다.", ["참치캔"]),
            dish("두부김치", 12, "두부를 데워 곁들이면 반찬 겸 식사입니다.", ["두부"])
          ]),
          foodItem("kkakdugi", "깍두기", ["깍두기", "즉석밥", "계란", "라면", "참기름"], "국물과 밥 메뉴에 잘 맞음", [
            dish("깍두기볶음밥", 10, "잘게 썰어 볶으면 식감이 좋습니다.", ["즉석밥"]),
            dish("깍두기라면", 8, "라면에 넣어 시원한 맛을 더합니다.", ["봉지라면"]),
            dish("깍두기계란밥", 7, "계란밥에 잘게 썬 깍두기를 올립니다.", ["계란"])
          ]),
          foodItem("yeolmu-kimchi", "열무김치", ["열무김치", "소면", "즉석밥", "계란", "참기름"], "비빔 메뉴에 바로 사용", [
            dish("열무비빔밥", 8, "밥과 참기름만 더해도 가볍게 먹습니다.", ["즉석밥"]),
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
            dish("무말랭이참치밥", 8, "참치와 섞으면 짠맛이 균형 잡힙니다.", ["참치캔"]),
            dish("무말랭이주먹밥", 9, "잘게 썰어 김가루와 뭉칩니다.", ["김가루"])
          ])
        ]
      }
    ]
  }
];

const state = {
  authenticated: false,
  user: null,
  csrfToken: null,
  pantry: [],
  history: [],
  totalSavings: 0,
  explorer: getDefaultExplorerSelection()
};

const anonymousId = getAnonymousId();

bindEvents();
renderCategoryExplorer();
await hydrateHealth();
await hydrateSession();

function bindEvents() {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuthForm(loginForm, "/api/auth/login", "로그인되었습니다.");
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuthForm(registerForm, "/api/auth/register", "계정이 생성되었습니다.");
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      clearAuthState();
      renderAll();
      setAuthMessage("로그아웃되었습니다.", false);
    } catch (error) {
      setAuthMessage(formatError(error), true);
    }
  });

  pantryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createPantryItem();
  });

  pantryList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-pantry]");
    if (!button) {
      return;
    }
    await deletePantryItem(button.dataset.deletePantry);
  });

  usePantryButton.addEventListener("click", () => {
    const names = state.pantry.map((item) => item.name);
    if (names.length) {
      document.querySelector("#ingredientsText").value = names.join(", ");
      setAuthMessage("저장된 재료를 입력란에 반영했습니다.", false);
    }
  });

  majorCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-major-id]");
    if (button) {
      selectMajorCategory(button.dataset.majorId);
    }
  });

  mediumCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-medium-id]");
    if (button) {
      selectMediumCategory(button.dataset.mediumId);
    }
  });

  smallCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-item-id]");
    if (button) {
      selectSmallCategory(button.dataset.itemId);
    }
  });

  applyCategoryButton.addEventListener("click", () => {
    applySelectedCategoryToForm();
  });

  requestCategoryButton.addEventListener("click", async () => {
    applySelectedCategoryToForm({ showStatus: false });
    await requestRecommendation();
  });

  demoButton.addEventListener("click", () => {
    document.querySelector("#ingredientsText").value = "계란, 김치, 두부, 밥, 대파";
    document.querySelector("#priorityNotes").value = "두부 유통기한 임박";
    document.querySelector("#goal").value = "save_money";
    document.querySelector("#servings").value = "1";
    document.querySelector("#maxCookTimeMinutes").value = "20";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await requestRecommendation();
  });
}

async function hydrateHealth() {
  try {
    const response = await fetch("/health", { credentials: "same-origin" });
    const data = await response.json();

    aiStatus.textContent = data.openaiConfigured ? "OpenAI 연결 준비" : "Fallback 데모 모드";
    aiStatus.className = `status-pill ${data.openaiConfigured ? "ready" : "fallback"}`;

    const dbReady = data.localDbConfigured || data.supabaseConfigured;
    dbStatus.textContent = data.supabaseConfigured ? "Supabase + 로컬 DB" : "로컬 DB 준비";
    dbStatus.className = `status-pill ${dbReady ? "ready" : "fallback"}`;
  } catch {
    aiStatus.textContent = "상태 확인 실패";
    dbStatus.textContent = "상태 확인 실패";
  }
}

async function hydrateSession() {
  try {
    const data = await apiFetch("/api/auth/session");
    if (data.authenticated) {
      applyAuthState(data);
      await hydrateProtectedData();
    } else {
      clearAuthState();
    }
  } catch {
    clearAuthState();
  }
  renderAll();
}

async function hydrateProtectedData() {
  if (!state.authenticated) {
    return;
  }

  const [pantry, history] = await Promise.all([
    apiFetch("/api/pantry"),
    apiFetch("/api/recommendations?limit=8")
  ]);

  state.pantry = pantry.items || [];
  state.history = history.logs || [];
  state.totalSavings = history.totalSavings || 0;
}

async function submitAuthForm(targetForm, endpoint, successMessage) {
  setFormLoading(targetForm, true);
  setAuthMessage("", false);

  try {
    const formData = new FormData(targetForm);
    const payload = Object.fromEntries(formData.entries());
    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    applyAuthState(data);
    await hydrateProtectedData();
    renderAll();
    setAuthMessage(successMessage, false);
    targetForm.reset();
  } catch (error) {
    setAuthMessage(formatError(error), true);
  } finally {
    setFormLoading(targetForm, false);
  }
}

async function createPantryItem() {
  if (!state.authenticated) {
    setAuthMessage("재료 저장은 로그인 후 사용할 수 있습니다.", true);
    return;
  }

  setFormLoading(pantryForm, true);
  try {
    const formData = new FormData(pantryForm);
    await apiFetch("/api/pantry", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    pantryForm.reset();
    await refreshPantry();
    setAuthMessage("재료가 저장되었습니다.", false);
  } catch (error) {
    setAuthMessage(formatError(error), true);
  } finally {
    setFormLoading(pantryForm, false);
  }
}

async function deletePantryItem(itemId) {
  try {
    await apiFetch(`/api/pantry/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    await refreshPantry();
    setAuthMessage("재료를 삭제했습니다.", false);
  } catch (error) {
    setAuthMessage(formatError(error), true);
  }
}

async function refreshPantry() {
  const data = await apiFetch("/api/pantry");
  state.pantry = data.items || [];
  renderPantry();
}

async function refreshHistory() {
  const data = await apiFetch("/api/recommendations?limit=8");
  state.history = data.logs || [];
  state.totalSavings = data.totalSavings || 0;
  renderHistory();
}

async function requestRecommendation() {
  setLoading(true);

  const formData = new FormData(form);
  const ingredientsText = String(formData.get("ingredientsText") || "");

  try {
    const data = await apiFetch("/api/recommend", {
      method: "POST",
      body: JSON.stringify({
        anonymousId,
        ingredientsText,
        preferences: {
          goal: formData.get("goal"),
          servings: Number(formData.get("servings")),
          maxCookTimeMinutes: Number(formData.get("maxCookTimeMinutes")),
          priorityNotes: formData.get("priorityNotes")
        }
      })
    });

    renderRecommendation(data);
    if (state.authenticated) {
      await refreshHistory();
    }
  } catch (error) {
    showMessage(formatError(error), true);
  } finally {
    setLoading(false);
  }
}

async function apiFetch(url, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (state.csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.set("X-CSRF-Token", state.csrfToken);
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "요청을 처리할 수 없습니다.");
    error.details = data.details;
    throw error;
  }

  return data;
}

function applyAuthState(data) {
  state.authenticated = Boolean(data.authenticated);
  state.user = data.user || null;
  state.csrfToken = data.csrfToken || null;
}

function clearAuthState() {
  state.authenticated = false;
  state.user = null;
  state.csrfToken = null;
  state.pantry = [];
  state.history = [];
  state.totalSavings = 0;
}

function renderAll() {
  renderAuth();
  renderPantry();
  renderHistory();
}

function renderAuth() {
  authEntry.classList.toggle("hidden", state.authenticated);
  sessionPanel.classList.toggle("hidden", !state.authenticated);

  if (state.authenticated && state.user) {
    authStatus.textContent = `${state.user.email} 로그인`;
    authStatus.className = "status-pill ready";
    accountEmail.textContent = state.user.email;
    accountName.textContent = state.user.displayName || "";
  } else {
    authStatus.textContent = "비로그인";
    authStatus.className = "status-pill fallback";
    accountEmail.textContent = "-";
    accountName.textContent = "";
  }
}

function renderPantry() {
  setFormDisabled(pantryForm, !state.authenticated);
  usePantryButton.disabled = !state.authenticated || state.pantry.length === 0;
  pantryList.innerHTML = "";

  if (!state.authenticated) {
    pantryList.innerHTML = '<span class="empty-state">로그인 후 재료를 저장할 수 있습니다.</span>';
    return;
  }

  if (!state.pantry.length) {
    pantryList.innerHTML = '<span class="empty-state">아직 저장된 재료가 없습니다.</span>';
    return;
  }

  for (const item of state.pantry) {
    const row = document.createElement("div");
    row.className = "data-row";
    const meta = [item.quantity, item.expiresAt ? `소비 기한 ${formatDate(item.expiresAt)}` : ""]
      .filter(Boolean)
      .join(" · ");
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(meta || "수량 미입력")}</span>
      </div>
      <button type="button" class="text-button" data-delete-pantry="${escapeAttr(item.id)}">삭제</button>
    `;
    pantryList.append(row);
  }
}

function renderHistory() {
  totalSavings.textContent = formatKrw(state.totalSavings);
  historyList.innerHTML = "";

  if (!state.authenticated) {
    historyList.innerHTML = '<span class="empty-state">로그인 후 추천 기록이 저장됩니다.</span>';
    return;
  }

  if (!state.history.length) {
    historyList.innerHTML = '<span class="empty-state">저장된 추천 기록이 없습니다.</span>';
    return;
  }

  for (const entry of state.history) {
    const row = document.createElement("div");
    row.className = "data-row history-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.recipeNames.join(", ") || "추천 메뉴")}</strong>
        <span>${escapeHtml(formatDateTime(entry.createdAt))} · ${formatKrw(entry.bestSavings)} 절약</span>
      </div>
    `;
    historyList.append(row);
  }
}

function renderCategoryExplorer() {
  const { major, medium, item } = getSelectedExplorer();
  renderCategoryButtons(majorCategories, CATEGORY_DATA, "major", major.id);
  renderCategoryButtons(mediumCategories, major.children, "medium", medium.id);
  renderSmallCategories(medium.items, item.id);
  renderSelectedIngredient(major, medium, item);
  renderCategoryRecipePreview(item);
}

function renderCategoryButtons(container, items, type, selectedId) {
  container.innerHTML = "";

  for (const entry of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button ${entry.id === selectedId ? "active" : ""}`;
    button.dataset[`${type}Id`] = entry.id;
    button.innerHTML = `
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${escapeHtml(entry.description)}</span>
    `;
    container.append(button);
  }
}

function renderSmallCategories(items, selectedId) {
  smallCategories.innerHTML = "";

  for (const entry of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip ${entry.id === selectedId ? "active" : ""}`;
    button.dataset.itemId = entry.id;
    button.textContent = entry.name;
    smallCategories.append(button);
  }
}

function renderSelectedIngredient(major, medium, item) {
  selectedIngredientSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(major.label)} / ${escapeHtml(medium.label)}</span>
    </div>
    <p>${escapeHtml(item.priorityNote)}</p>
    <div class="chip-row">
      ${item.ingredients.slice(0, 6).map((ingredient) => `<span class="chip">${escapeHtml(ingredient)}</span>`).join("")}
    </div>
  `;
}

function renderCategoryRecipePreview(item) {
  categoryRecipes.innerHTML = "";

  item.recipes.forEach((recipe, index) => {
    const fullRecipe = toFullCategoryRecipe(item, recipe, index);
    const article = document.createElement("article");
    article.className = "mini-recipe-card";
    article.innerHTML = `
      <div>
        <h3>${escapeHtml(fullRecipe.name)}</h3>
        <div class="recipe-meta">
          <span class="tag">${fullRecipe.cookTimeMinutes}분</span>
          <span class="tag">${difficultyLabel(fullRecipe.difficulty)}</span>
        </div>
      </div>
      <p>${escapeHtml(fullRecipe.reason)}</p>
    `;
    categoryRecipes.append(article);
  });
}

function selectMajorCategory(majorId) {
  const major = CATEGORY_DATA.find((entry) => entry.id === majorId) || CATEGORY_DATA[0];
  const medium = major.children[0];
  const item = medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
}

function selectMediumCategory(mediumId) {
  const { major } = getSelectedExplorer();
  const medium = major.children.find((entry) => entry.id === mediumId) || major.children[0];
  const item = medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
}

function selectSmallCategory(itemId) {
  const { major, medium } = getSelectedExplorer();
  const item = medium.items.find((entry) => entry.id === itemId) || medium.items[0];
  state.explorer = {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
  renderCategoryExplorer();
  renderRecommendation(buildCategoryRecommendation(item));
}

function applySelectedCategoryToForm(options = {}) {
  const { item } = getSelectedExplorer();
  const showStatus = options.showStatus !== false;
  document.querySelector("#ingredientsText").value = item.ingredients.join(", ");
  document.querySelector("#priorityNotes").value = item.priorityNote;
  document.querySelector("#goal").value = "quick";
  document.querySelector("#servings").value = "1";
  document.querySelector("#maxCookTimeMinutes").value = item.recipes.some((recipe) => recipe.cookTimeMinutes <= 10)
    ? "10"
    : "20";

  if (showStatus) {
    showMessage(`${item.name} 기준 재료를 입력란에 반영했습니다.`, false);
  }
}

function buildCategoryRecommendation(item) {
  const recipes = item.recipes.map((recipe, index) => toFullCategoryRecipe(item, recipe, index));

  return {
    recipes,
    priorityIngredients: item.ingredients.slice(0, 5),
    summary: `${item.name}로 바로 만들기 좋은 자취생 메뉴입니다.`,
    totals: {
      bestSavings: Math.max(...recipes.map((recipe) => recipe.estimatedSavings)),
      averageDeliveryCost: 12000,
      estimatedHomeCookingCost: 3500
    },
    meta: {
      source: "curated",
      logging: {
        stored: false
      }
    }
  };
}

function toFullCategoryRecipe(item, recipe, index) {
  const ownedIngredients = uniqueValues([item.name, ...recipe.extraIngredients, ...item.ingredients]).slice(0, 8);
  const missingIngredients = recipe.extraIngredients
    .filter((ingredient) => !item.ingredients.includes(ingredient))
    .slice(0, 4);
  const primaryExtra = recipe.extraIngredients[0] || item.ingredients[1] || "기본 재료";

  return {
    name: recipe.name,
    reason: recipe.reason,
    ownedIngredients,
    missingIngredients,
    cookTimeMinutes: recipe.cookTimeMinutes,
    difficulty: recipe.cookTimeMinutes <= 10 ? "easy" : recipe.cookTimeMinutes <= 15 ? "medium" : "hard",
    steps: [
      `${item.name}과 ${primaryExtra}를 준비합니다.`,
      "팬, 냄비, 전자레인지 중 가장 빠른 조리 도구로 데우거나 볶습니다.",
      "밥이나 면이 필요한 메뉴는 마지막에 넣고 고르게 섞습니다.",
      "간을 본 뒤 김치, 참기름, 김가루 같은 재료로 마무리합니다."
    ],
    estimatedSavings: Math.max(5000, 9000 - index * 700 - Math.max(0, recipe.cookTimeMinutes - 10) * 120)
  };
}

function renderRecommendation(data) {
  const source = data.meta?.source;
  const sourceLabel =
    source === "openai" ? "OpenAI 추천" : source === "curated" ? "분류 기반 추천" : "데모 fallback 추천";
  const loggingLabel =
    source === "curated"
      ? "AI 추천 전 미저장"
      : data.meta?.logging?.stored
        ? "추천 기록 저장됨"
        : "로그인 시 추천 기록 저장";
  showMessage(`${sourceLabel} · ${loggingLabel} · ${data.summary}`, false);

  const totals = data.totals || {};
  bestSavings.textContent = formatKrw(totals.bestSavings || 0);
  deliveryCost.textContent = formatKrw(totals.averageDeliveryCost || 12000);
  homeCost.textContent = formatKrw(totals.estimatedHomeCookingCost || 3500);
  savingsBarFill.style.width = `${Math.min(100, Math.round(((totals.bestSavings || 0) / 12000) * 100))}%`;

  renderPriorityIngredients(data.priorityIngredients || []);
  renderRecipes(data.recipes || []);
}

function renderPriorityIngredients(items) {
  priorityIngredients.innerHTML = "";

  if (!items.length) {
    priorityIngredients.innerHTML = '<span class="empty-state">추천 후 표시됩니다.</span>';
    return;
  }

  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    priorityIngredients.append(chip);
  }
}

function renderRecipes(recipes) {
  recipesContainer.innerHTML = "";

  for (const recipe of recipes) {
    const article = document.createElement("article");
    article.className = "recipe-card";

    const missing = recipe.missingIngredients?.length
      ? recipe.missingIngredients.map(escapeHtml).join(", ")
      : "추가 구매 없음";

    article.innerHTML = `
      <div class="recipe-topline">
        <div>
          <h3>${escapeHtml(recipe.name)}</h3>
          <div class="recipe-meta">
            <span class="tag">${recipe.cookTimeMinutes}분</span>
            <span class="tag">${difficultyLabel(recipe.difficulty)}</span>
            <span class="tag money">${formatKrw(recipe.estimatedSavings)} 절약</span>
          </div>
        </div>
      </div>
      <p>${escapeHtml(recipe.reason)}</p>
      <div>
        <strong>사용 재료</strong>
        <ul class="ingredient-list">
          ${(recipe.ownedIngredients || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
      <div>
        <strong>부족한 재료</strong>
        <p>${missing}</p>
      </div>
      <div>
        <strong>조리 순서</strong>
        <ol class="steps">
          ${(recipe.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </div>
    `;

    recipesContainer.append(article);
  }
}

function switchAuthTab(tab) {
  const isRegister = tab === "register";
  loginForm.classList.toggle("hidden", isRegister);
  registerForm.classList.toggle("hidden", !isRegister);
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
}

function setAuthMessage(text, isError) {
  authMessage.textContent = text;
  authMessage.classList.toggle("error", Boolean(isError));
}

function showMessage(text, isError) {
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
}

function setLoading(isLoading) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "추천 생성 중" : "메뉴 추천받기";
}

function setFormLoading(targetForm, isLoading) {
  const submitButton = targetForm.querySelector('button[type="submit"]');
  targetForm.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = isLoading;
  });
  if (submitButton) {
    submitButton.dataset.originalText ||= submitButton.textContent;
    submitButton.textContent = isLoading ? "처리 중" : submitButton.dataset.originalText;
  }
}

function setFormDisabled(targetForm, isDisabled) {
  targetForm.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = isDisabled;
  });
}

function getDefaultExplorerSelection() {
  const major = CATEGORY_DATA[0];
  const medium = major.children[0];
  const item = medium.items[0];
  return {
    majorId: major.id,
    mediumId: medium.id,
    itemId: item.id
  };
}

function getSelectedExplorer() {
  const major = CATEGORY_DATA.find((entry) => entry.id === state.explorer.majorId) || CATEGORY_DATA[0];
  const medium = major.children.find((entry) => entry.id === state.explorer.mediumId) || major.children[0];
  const item = medium.items.find((entry) => entry.id === state.explorer.itemId) || medium.items[0];
  return { major, medium, item };
}

function foodItem(id, name, ingredients, priorityNote, recipes) {
  return {
    id,
    name,
    ingredients: uniqueValues(ingredients),
    priorityNote,
    recipes
  };
}

function dish(name, cookTimeMinutes, reason, extraIngredients = []) {
  return {
    name,
    cookTimeMinutes,
    reason,
    extraIngredients
  };
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function getAnonymousId() {
  const key = "fridge_ingredients_anonymous_id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const generated =
    crypto.randomUUID?.() ||
    `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}

function difficultyLabel(value) {
  return {
    easy: "쉬움",
    medium: "보통",
    hard: "어려움"
  }[value] || "쉬움";
}

function formatKrw(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatError(error) {
  const details = Array.isArray(error.details) ? ` ${error.details.join(" ")}` : "";
  return `${error.message}${details}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
