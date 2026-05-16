const placeTypeList = document.querySelector("#placeTypeList");
const placeRegionList = document.querySelector("#placeRegionList");
const placeAreaList = document.querySelector("#placeAreaList");
const placeSummary = document.querySelector("#placeSummary");
const placeCardGrid = document.querySelector("#placeCardGrid");
const placeCount = document.querySelector("#placeCount");
const placeEmpty = document.querySelector("#placeEmpty");
const placeSearch = document.querySelector("#placeSearch");
const filterButtons = [...document.querySelectorAll("[data-place-filter]")];

const PLACE_DATA = [
  {
    id: "metro",
    label: "특별시·광역시·특별자치시",
    description: "도심 접근성이 좋은 대도시권",
    regions: [
      region("seoul", "서울특별시", "고궁, 한강, 골목 상권이 밀집한 수도권 중심", [
        area("seoul-jongno", "종로·중구", "고궁과 근현대 도심 산책", [
          place("경복궁", "역사", "조선 왕조의 대표 궁궐로 광화문, 국립고궁박물관과 함께 보기 좋습니다.", "역사 산책", "지하철 접근 좋음"),
          place("창덕궁·후원", "역사", "유네스코 세계유산 궁궐로 조용한 산책과 전통 건축 감상에 적합합니다.", "예약 확인", "방문 전 회차 확인"),
          place("덕수궁·정동길", "역사", "궁궐 돌담길과 근대 건축을 함께 걷기 좋은 도심 코스입니다.", "저녁 산책", "비용 부담 적음"),
          place("종묘", "역사", "조선 왕실 제례 공간으로 도심 속 차분한 역사 탐방지입니다.", "문화유산", "해설 관람 추천"),
          place("청계천·광화문광장", "랜드마크", "약속 장소와 산책 코스로 쓰기 좋은 서울 중심부 열린 공간입니다.", "가벼운 만남", "무료")
        ]),
        area("seoul-river", "용산·마포·성동", "한강, 박물관, 젊은 거리 문화", [
          place("N서울타워·남산공원", "랜드마크", "서울 야경과 산책을 함께 즐길 수 있는 대표 전망 명소입니다.", "야경", "도보 코스 가능"),
          place("국립중앙박물관", "문화", "상설전시 관람 부담이 적고 비 오는 날에도 가기 좋은 실내 명소입니다.", "실내", "무료 전시 중심"),
          place("뚝섬한강공원", "자연", "강변 산책, 자전거, 피크닉을 즐기기 쉬운 한강공원입니다.", "피크닉", "날씨 확인"),
          place("홍대·연남동 거리", "거리·시장", "공연, 소품숍, 카페가 밀집해 친구와 걷기 좋은 상권입니다.", "친구 모임", "소비 조절 필요"),
          place("서울숲", "자연", "도심 속 숲길과 성수동 카페권을 함께 둘러보기 좋습니다.", "산책", "무료")
        ]),
        area("seoul-east", "강남·송파·강동", "전망, 쇼핑, 호수 산책", [
          place("롯데월드타워·석촌호수", "랜드마크", "전망대와 호수 산책을 한 번에 묶기 좋은 동남권 대표 코스입니다.", "야경", "전망대 유료"),
          place("봉은사", "역사", "코엑스 인근에서 조용히 쉬어가기 좋은 전통 사찰입니다.", "도심 사찰", "무료 구간"),
          place("코엑스·별마당도서관", "문화", "실내 약속 장소로 편하고 전시, 쇼핑, 영화 동선이 좋습니다.", "비 오는 날", "혼잡 시간 주의"),
          place("올림픽공원", "자연", "넓은 잔디와 산책로, 공연장이 있어 장시간 머물기 좋습니다.", "산책", "무료"),
          place("암사동 선사유적지", "역사", "서울 동쪽에서 선사시대 유적을 볼 수 있는 교육형 명소입니다.", "역사 탐방", "운영 확인")
        ])
      ]),
      region("busan", "부산광역시", "바다, 산복도로, 항구 문화가 강한 해양 도시", [
        area("busan-east", "해운대·수영", "해변, 야경, 영화 문화", [
          place("해운대해수욕장", "자연", "부산을 대표하는 도심 해변으로 산책과 바다 구경에 좋습니다.", "바다", "성수기 혼잡"),
          place("광안리해수욕장·광안대교", "랜드마크", "야경과 카페, 해변 산책이 강한 저녁 코스입니다.", "야경", "저녁 추천"),
          place("동백섬·누리마루", "자연", "해운대와 연결되는 해안 산책 코스로 부담 없이 걷기 좋습니다.", "산책", "무료"),
          place("영화의전당", "문화", "부산국제영화제의 상징 공간으로 건축과 야간 조명이 인상적입니다.", "문화", "상영 일정 확인")
        ]),
        area("busan-oldtown", "중구·영도", "시장, 항구, 전망대", [
          place("자갈치시장", "거리·시장", "부산 항구 분위기와 해산물 시장을 함께 느낄 수 있습니다.", "시장 구경", "가격 확인"),
          place("국제시장·BIFF광장", "거리·시장", "먹거리와 오래된 골목 상권을 함께 돌기 좋은 원도심 코스입니다.", "먹거리", "도보 이동"),
          place("태종대", "자연", "영도 해안 절벽과 등대 풍경을 볼 수 있는 대표 자연 명소입니다.", "바다 산책", "걷는 시간 확보"),
          place("흰여울문화마을", "랜드마크", "바다를 끼고 골목과 전망을 즐기는 영도 산책 코스입니다.", "사진", "주거지 배려")
        ]),
        area("busan-west", "사하·금정·서구", "마을 풍경, 사찰, 해상 산책", [
          place("감천문화마을", "랜드마크", "계단식 마을 풍경과 골목 산책으로 유명한 부산 대표 명소입니다.", "사진", "주거지 배려"),
          place("범어사", "역사", "금정산 자락의 유서 깊은 사찰로 조용한 반나절 코스에 좋습니다.", "사찰", "등산 연계"),
          place("송도해수욕장·용궁구름다리", "랜드마크", "해상 산책로와 바다 전망을 함께 즐길 수 있습니다.", "바다", "운영 확인"),
          place("금정산성", "역사", "성곽길과 산행을 같이 즐길 수 있는 부산 북부 역사 코스입니다.", "트레킹", "운동화 추천")
        ])
      ]),
      region("daegu", "대구광역시", "근대골목, 시장, 팔공산권이 뚜렷한 내륙 도시", [
        area("daegu-center", "중구·남구", "시장과 근대 역사 골목", [
          place("서문시장", "거리·시장", "먹거리와 야시장이 강한 대구 대표 전통시장입니다.", "먹거리", "현금 준비"),
          place("동성로", "거리·시장", "쇼핑, 카페, 영화관이 밀집한 대구 중심 상권입니다.", "친구 모임", "소비 조절"),
          place("대구근대골목", "역사", "계산성당, 이상화고택 등 근대 건축과 골목을 묶어 걷기 좋습니다.", "도보 탐방", "낮 시간 추천"),
          place("앞산공원", "자연", "전망대와 케이블카, 산책로가 있어 야경 코스로도 좋습니다.", "야경", "운영 확인")
        ]),
        area("daegu-east", "동구·군위", "팔공산과 조용한 정원", [
          place("팔공산", "자연", "대구 대표 산악권으로 드라이브, 산책, 단풍 코스가 좋습니다.", "자연", "계절 확인"),
          place("동화사", "역사", "팔공산권의 대표 사찰로 고즈넉한 산사 분위기가 있습니다.", "사찰", "산책 연계"),
          place("사유원", "문화", "군위의 건축, 정원, 자연을 함께 보는 조용한 체류형 명소입니다.", "조용한 날", "예약 확인"),
          place("방짜유기박물관", "문화", "전통 공예와 생활문화를 볼 수 있는 실내 문화 공간입니다.", "실내", "운영 확인")
        ]),
        area("daegu-dalseong", "달성", "서원, 강변, 꽃 명소", [
          place("도동서원", "역사", "한국의 서원 중 하나로 전통 교육 공간을 볼 수 있는 유산입니다.", "역사", "해설 추천"),
          place("비슬산", "자연", "봄 참꽃과 가을 산행으로 알려진 대구 남부 산악 명소입니다.", "트레킹", "계절 추천"),
          place("사문진나루터", "랜드마크", "낙동강변 산책과 음악분수, 피크닉을 즐기기 좋습니다.", "산책", "저녁 추천")
        ])
      ]),
      region("incheon", "인천광역시", "개항장, 섬, 서해 낙조가 강한 도시", [
        area("incheon-openport", "중구·동구", "개항장과 항구 산책", [
          place("인천차이나타운", "거리·시장", "개항장 역사와 먹거리를 함께 보는 원도심 코스입니다.", "먹거리", "주말 혼잡"),
          place("개항장거리", "역사", "근대 건축과 박물관을 도보로 연결하기 좋은 역사 산책지입니다.", "근대사", "도보 코스"),
          place("월미도", "랜드마크", "놀이시설, 바다 산책, 노을을 함께 즐길 수 있습니다.", "가벼운 나들이", "야간 가능"),
          place("송월동 동화마을", "랜드마크", "차이나타운 인근에서 짧게 둘러보기 좋은 벽화 마을입니다.", "사진", "짧은 코스")
        ]),
        area("incheon-songdo", "연수·남동", "신도시 공원과 갯벌권", [
          place("송도센트럴파크", "랜드마크", "도심 수로와 고층 빌딩 풍경이 있는 인천 대표 산책지입니다.", "야경", "무료 산책"),
          place("소래포구", "거리·시장", "어시장과 포구 풍경을 같이 보는 서해권 명소입니다.", "시장 구경", "가격 확인"),
          place("인천대공원", "자연", "넓은 공원과 호수, 자전거 산책에 적합합니다.", "피크닉", "무료"),
          place("늘솔길공원 양떼목장", "자연", "도심 가까이에서 가볍게 쉬기 좋은 공원형 명소입니다.", "가벼운 산책", "가족 동선")
        ]),
        area("incheon-ganghwa", "강화", "고인돌, 사찰, 섬 여행", [
          place("강화 고인돌 유적", "역사", "세계유산 고인돌 유적을 볼 수 있는 강화 대표 역사 명소입니다.", "역사", "야외"),
          place("전등사", "역사", "강화도의 오래된 사찰로 정족산성과 함께 둘러보기 좋습니다.", "사찰", "걷기 있음"),
          place("고려궁지", "역사", "고려시대 강화 천도 역사를 이해하기 좋은 유적지입니다.", "역사", "짧은 관람"),
          place("마니산", "자연", "강화 남부의 대표 산행지로 참성단과 연결됩니다.", "트레킹", "등산 준비")
        ])
      ]),
      region("gwangju", "광주광역시", "무등산, 민주화 역사, 예술 거점이 있는 도시", [
        area("gwangju-center", "동구·남구", "예술과 근현대 역사", [
          place("국립아시아문화전당", "문화", "전시와 공연, 광장 휴식을 함께 즐길 수 있는 광주 대표 문화 거점입니다.", "실내", "전시 확인"),
          place("양림동역사문화마을", "역사", "근대 선교 건축과 골목 카페가 공존하는 산책 코스입니다.", "골목 산책", "도보 추천"),
          place("5·18민주광장", "역사", "광주의 민주화 역사를 기억하는 도심 역사 공간입니다.", "역사", "ACC 연계"),
          place("사직공원전망타워", "랜드마크", "광주 도심을 내려다보기 좋은 전망 명소입니다.", "야경", "운영 확인")
        ]),
        area("gwangju-nature", "북구·서구", "산과 호수, 박물관", [
          place("무등산국립공원", "자연", "광주를 대표하는 산으로 계절별 산행과 전망이 좋습니다.", "트레킹", "등산 준비"),
          place("국립광주박물관", "문화", "호남 지역 문화유산을 실내에서 차분히 볼 수 있습니다.", "실내", "무료 전시 중심"),
          place("광주호호수생태원", "자연", "호수와 습지 산책을 함께 즐길 수 있는 조용한 명소입니다.", "산책", "대중교통 확인"),
          place("1913송정역시장", "거리·시장", "간단한 먹거리와 오래된 시장 분위기를 즐기기 좋습니다.", "먹거리", "저녁 코스")
        ])
      ]),
      region("daejeon", "대전광역시", "과학, 온천, 산책로가 강한 중부 도시", [
        area("daejeon-yuseong", "유성", "과학공원과 온천권", [
          place("엑스포과학공원·한빛탑", "랜드마크", "대전의 과학도시 이미지를 보여주는 대표 공간입니다.", "야경", "갑천 산책 연계"),
          place("한밭수목원", "자연", "도심 속 대형 수목원으로 산책과 사진에 좋습니다.", "산책", "무료"),
          place("유성온천거리", "문화", "온천 족욕과 가벼운 저녁 산책을 하기 좋은 거리입니다.", "휴식", "겨울 추천"),
          place("계족산황톳길", "자연", "맨발 걷기로 유명한 숲길 코스입니다.", "걷기", "계절 확인")
        ]),
        area("daejeon-oldtown", "중구·동구", "원도심과 전망", [
          place("대동하늘공원", "랜드마크", "벽화마을과 전망을 함께 즐기는 원도심 산책지입니다.", "사진", "해질녘 추천"),
          place("옛 충남도청·근현대사전시관", "역사", "대전 근현대 도시사를 볼 수 있는 원도심 문화 공간입니다.", "역사", "운영 확인"),
          place("보문산", "자연", "전망대와 산책로가 있어 가볍게 걷기 좋습니다.", "산책", "운동화 추천"),
          place("성심당 본점 거리", "거리·시장", "대전 원도심 방문 때 함께 들르기 좋은 대표 상권입니다.", "먹거리", "대기 가능")
        ])
      ]),
      region("ulsan", "울산광역시", "태화강, 바다, 암각화, 영남알프스가 만나는 도시", [
        area("ulsan-center", "중구·남구", "강변 정원과 도심 문화", [
          place("태화강국가정원", "자연", "대나무숲과 강변 산책이 좋은 울산 대표 정원입니다.", "산책", "무료"),
          place("울산대공원", "자연", "넓은 녹지와 산책로가 있어 일상 나들이에 좋습니다.", "피크닉", "무료 구간"),
          place("장생포고래문화마을", "문화", "울산의 고래 문화를 전시와 마을형 공간으로 볼 수 있습니다.", "문화", "운영 확인"),
          place("성남동 젊음의거리", "거리·시장", "먹거리와 쇼핑, 영화관이 모인 원도심 상권입니다.", "친구 모임", "저녁 코스")
        ]),
        area("ulsan-coast", "동구·북구·울주", "해안과 선사 유적", [
          place("대왕암공원", "자연", "해송 숲과 바위 해안을 함께 걷는 울산 대표 바다 명소입니다.", "바다 산책", "무료"),
          place("간절곶", "랜드마크", "동해 일출과 바다 전망을 보러 가기 좋은 명소입니다.", "일출", "날씨 확인"),
          place("반구대 암각화", "역사", "선사시대 바위그림을 만나는 울산의 핵심 유적입니다.", "역사", "보존 구역"),
          place("영남알프스", "자연", "억새와 산악 풍경이 유명한 울산·경남 산악권입니다.", "트레킹", "등산 준비")
        ])
      ]),
      region("sejong", "세종특별자치시", "신도시 공원과 행정·기록 문화 공간", [
        area("sejong-core", "호수공원·중앙공원권", "공원, 수목원, 도시 산책", [
          place("세종호수공원", "자연", "호수 둘레 산책과 야간 조명이 좋은 세종 대표 공원입니다.", "산책", "무료"),
          place("세종중앙공원", "자연", "넓은 잔디와 산책로가 있어 피크닉에 좋습니다.", "피크닉", "무료"),
          place("국립세종수목원", "자연", "사계절 실내외 식물 전시를 볼 수 있는 수목원입니다.", "실내외", "입장료 확인"),
          place("금강보행교", "랜드마크", "금강 위 원형 보행교로 야간 산책과 사진에 좋습니다.", "야경", "날씨 확인")
        ]),
        area("sejong-culture", "조치원·전의·연기", "기록 문화와 근교 나들이", [
          place("대통령기록관", "문화", "대통령 기록과 현대사를 실내에서 볼 수 있는 전시 공간입니다.", "실내", "운영 확인"),
          place("조치원문화정원", "문화", "옛 정수장을 활용한 문화 공간으로 가볍게 들르기 좋습니다.", "동네 산책", "행사 확인"),
          place("베어트리파크", "자연", "수목원과 동물 관람을 함께하는 세종 근교 나들이지입니다.", "근교", "입장료 확인"),
          place("운주산성", "역사", "세종 북부에서 산성 산책과 전망을 함께 볼 수 있습니다.", "역사 산책", "운동화 추천")
        ])
      ])
    ]
  },
  {
    id: "province",
    label: "도·특별자치도",
    description: "시군 단위 여행지가 넓게 퍼진 권역",
    regions: [
      region("gyeonggi", "경기도", "수도권 근교 역사, 테마파크, 평화 관광", [
        area("gyeonggi-south", "수원·용인", "세계유산 성곽과 전통 체험", [
          place("수원화성", "역사", "정조 시대 성곽과 행궁, 행리단길을 함께 걷기 좋은 세계유산입니다.", "역사 산책", "야간 산책 좋음"),
          place("화성행궁", "역사", "수원화성과 함께 보기 좋은 조선시대 행궁 공간입니다.", "역사", "행사 확인"),
          place("한국민속촌", "문화", "전통 생활문화와 공연을 체험하는 대표 테마형 명소입니다.", "체험", "입장료 확인"),
          place("에버랜드", "랜드마크", "놀이기구와 계절 축제가 강한 수도권 대형 테마파크입니다.", "친구 모임", "종일 코스")
        ]),
        area("gyeonggi-north", "파주·고양", "평화 관광과 호수 공원", [
          place("임진각평화누리공원", "역사", "분단 역사와 평화 관광을 함께 생각해볼 수 있는 파주 대표지입니다.", "역사", "바람 많은 날 주의"),
          place("헤이리예술마을", "문화", "갤러리, 카페, 책방이 모인 파주 문화 산책지입니다.", "데이트", "도보 코스"),
          place("일산호수공원", "자연", "넓은 호수와 산책로가 있어 피크닉과 걷기에 좋습니다.", "산책", "무료"),
          place("행주산성", "역사", "임진왜란 역사를 품은 한강변 산성 명소입니다.", "역사", "가벼운 오르막")
        ]),
        area("gyeonggi-eastwest", "가평·양평·안산", "수목원, 강변, 섬 나들이", [
          place("아침고요수목원", "자연", "계절별 정원 풍경과 야간 조명이 유명한 가평 명소입니다.", "정원", "입장료 확인"),
          place("두물머리", "자연", "남한강과 북한강이 만나는 물안개 풍경의 산책지입니다.", "사진", "이른 시간 추천"),
          place("광명동굴", "랜드마크", "폐광을 활용한 실내 관광지로 더운 날이나 비 오는 날에 좋습니다.", "실내", "입장료 확인"),
          place("대부도", "자연", "서해 바다와 낙조, 방아머리해변을 함께 둘러보기 좋습니다.", "바다", "교통 확인")
        ])
      ]),
      region("gangwon", "강원특별자치도", "동해, 산악, 호수 관광이 강한 권역", [
        area("gangwon-lake", "춘천·홍천", "호수와 레저", [
          place("남이섬", "랜드마크", "강변 섬 산책과 계절 풍경으로 유명한 근교 여행지입니다.", "당일치기", "입장료 확인"),
          place("소양강스카이워크", "랜드마크", "춘천 호수 전망을 짧고 강하게 즐길 수 있는 명소입니다.", "사진", "운영 확인"),
          place("강촌레일파크", "문화", "옛 철길을 활용한 레일바이크 코스로 친구와 가기 좋습니다.", "체험", "예약 확인"),
          place("비발디파크", "랜드마크", "스키, 워터파크, 숙박을 묶는 홍천 대형 리조트권입니다.", "종일 코스", "시즌 확인")
        ]),
        area("gangwon-east", "강릉·속초·양양", "동해 바다와 사찰", [
          place("경포대·경포호", "자연", "강릉 바다와 호수 산책을 함께 즐기는 대표 코스입니다.", "바다", "자전거 가능"),
          place("주문진항", "거리·시장", "동해안 어항과 시장 분위기를 느낄 수 있는 강릉 북부 명소입니다.", "먹거리", "가격 확인"),
          place("설악산국립공원", "자연", "강원 동해권의 대표 산악 명소로 사계절 풍경이 강합니다.", "트레킹", "코스 확인"),
          place("낙산사", "역사", "바다 절벽과 사찰 풍경이 함께 있는 양양 대표 명소입니다.", "사찰", "해안 산책")
        ]),
        area("gangwon-mountain", "원주·평창·정선·철원", "산악, 박물관, 지질 명소", [
          place("뮤지엄 산", "문화", "건축, 자연, 전시가 결합된 원주 대표 문화 공간입니다.", "전시", "예약 확인"),
          place("대관령", "자연", "목장과 풍력 풍경을 즐기기 좋은 평창권 드라이브 코스입니다.", "자연", "날씨 확인"),
          place("정선아리랑시장", "거리·시장", "정선 로컬 먹거리와 장터 분위기를 즐기기 좋습니다.", "시장", "장날 확인"),
          place("한탄강 주상절리길", "자연", "현무암 협곡과 잔도를 걷는 철원 대표 지질 명소입니다.", "트레킹", "운영 확인")
        ])
      ]),
      region("chungbuk", "충청북도", "내륙 호수, 산성, 사찰 여행지", [
        area("chungbuk-cheongju", "청주·진천", "산성과 대통령 별장", [
          place("청남대", "역사", "대통령 별장으로 쓰였던 대청호변 역사·산책 명소입니다.", "산책", "예약/입장 확인"),
          place("상당산성", "역사", "청주 도심 가까이에서 성곽길과 전망을 즐길 수 있습니다.", "걷기", "운동화 추천"),
          place("국립청주박물관", "문화", "충북 지역 문화유산을 실내에서 볼 수 있는 공간입니다.", "실내", "무료 전시 중심"),
          place("초정행궁", "역사", "세종대왕의 초정 약수 행차 이야기를 담은 역사 공간입니다.", "역사", "운영 확인")
        ]),
        area("chungbuk-lake", "충주·제천·단양", "호수와 절경", [
          place("단양팔경", "자연", "도담삼봉, 석문 등 단양 대표 절경을 묶어 보는 코스입니다.", "자연", "동선 계획"),
          place("청풍호반케이블카", "랜드마크", "제천 청풍호와 산악 전망을 한 번에 보는 명소입니다.", "전망", "운영 확인"),
          place("의림지", "역사", "제천의 오래된 저수지와 산책로를 함께 즐길 수 있습니다.", "산책", "무료"),
          place("탄금대", "역사", "충주의 역사와 남한강 전망을 함께 보는 산책지입니다.", "역사", "짧은 코스")
        ]),
        area("chungbuk-nature", "보은·괴산", "산사와 계곡", [
          place("속리산 법주사", "역사", "속리산 자락의 대표 사찰이자 문화유산 탐방지입니다.", "사찰", "걷기 있음"),
          place("산막이옛길", "자연", "괴산호를 따라 걷는 수변 산책로입니다.", "산책", "계절 추천"),
          place("화양구곡", "자연", "계곡과 숲길이 이어지는 괴산 대표 자연 명소입니다.", "계곡", "여름 추천")
        ])
      ]),
      region("chungnam", "충청남도", "백제 유산, 온천, 서해안 여행지", [
        area("chungnam-baekje", "공주·부여", "백제 역사 핵심권", [
          place("공산성", "역사", "백제 웅진시대 왕성으로 금강변 성곽 산책이 좋습니다.", "세계유산", "성곽길"),
          place("무령왕릉과 왕릉원", "역사", "백제 왕릉과 출토 유물을 이해하기 좋은 공주 대표 유적입니다.", "역사", "박물관 연계"),
          place("부소산성·낙화암", "역사", "부여 백제 역사를 대표하는 산성과 금강 전망지입니다.", "역사", "걷기 있음"),
          place("백제문화단지", "문화", "백제 왕궁과 생활 문화를 재현한 대형 역사 체험지입니다.", "체험", "입장료 확인")
        ]),
        area("chungnam-north", "천안·아산", "독립운동과 온천", [
          place("독립기념관", "역사", "한국 독립운동사를 넓은 전시와 야외 공간으로 볼 수 있습니다.", "역사", "반나절 코스"),
          place("현충사", "역사", "이순신 장군을 기리는 아산 대표 역사 유적입니다.", "역사", "무료 구간 확인"),
          place("온양온천", "문화", "오래된 온천 도시 분위기와 휴식을 함께 즐길 수 있습니다.", "휴식", "탕별 요금 확인"),
          place("공세리성당", "역사", "고즈넉한 성당 건축과 산책로가 인상적인 아산 명소입니다.", "사진", "예절 준수")
        ]),
        area("chungnam-west", "서산·태안·보령", "서해 바다와 읍성", [
          place("해미읍성", "역사", "조선시대 읍성 경관과 천주교 순교 역사를 볼 수 있습니다.", "역사", "무료 구간"),
          place("태안해안국립공원", "자연", "해변과 섬, 낙조를 묶어 즐기는 서해안 대표 자연권입니다.", "바다", "날씨 확인"),
          place("안면도 꽃지해수욕장", "자연", "할미·할아비바위 낙조로 유명한 서해 해변입니다.", "낙조", "해질녘 추천"),
          place("대천해수욕장", "자연", "보령 대표 해변으로 여름 축제와 바다 산책이 강합니다.", "바다", "성수기 혼잡")
        ])
      ]),
      region("jeonbuk", "전북특별자치도", "한옥, 근대사, 산악 명소가 고르게 분포", [
        area("jeonbuk-jeonju", "전주·완주", "한옥과 산악 근교", [
          place("전주한옥마을", "랜드마크", "한옥 거리, 경기전, 먹거리를 함께 즐기는 전북 대표 명소입니다.", "골목 산책", "주말 혼잡"),
          place("경기전", "역사", "태조 어진과 조선 왕실 관련 역사를 볼 수 있는 전주 유적입니다.", "역사", "한옥마을 연계"),
          place("오성한옥마을", "랜드마크", "완주의 한옥, 카페, 숲 풍경을 조용히 즐기기 좋은 명소입니다.", "감성 산책", "대중교통 확인"),
          place("대둔산도립공원", "자연", "구름다리와 산악 풍경이 강한 전북·충남 경계 산행지입니다.", "트레킹", "등산 준비")
        ]),
        area("jeonbuk-west", "군산·익산", "근대사와 백제 유적", [
          place("군산근대역사박물관", "역사", "군산항과 근대 도시의 역사를 이해하기 좋은 공간입니다.", "근대사", "원도심 연계"),
          place("고군산군도", "자연", "선유도와 주변 섬 풍경, 해변 산책이 좋은 서해 섬 코스입니다.", "바다", "교통 확인"),
          place("익산 미륵사지", "역사", "백제 최대 사찰터와 석탑을 볼 수 있는 핵심 유적입니다.", "역사", "박물관 연계"),
          place("왕궁리유적", "역사", "백제 왕궁 관련 유적으로 익산 역사 여행에 좋습니다.", "역사", "야외")
        ]),
        area("jeonbuk-south", "정읍·남원·진안·순창", "단풍, 누각, 산악 공원", [
          place("내장산국립공원", "자연", "단풍 명소로 유명한 정읍 대표 자연 관광지입니다.", "단풍", "가을 혼잡"),
          place("광한루원", "역사", "춘향전 배경으로 알려진 남원 대표 누정 정원입니다.", "역사", "야간 개장 확인"),
          place("마이산도립공원", "자연", "말 귀 모양 봉우리와 탑사로 유명한 진안 명소입니다.", "트레킹", "계절 추천"),
          place("강천산군립공원", "자연", "계곡, 출렁다리, 숲길이 좋은 순창 대표 산책지입니다.", "자연", "운영 확인")
        ])
      ]),
      region("jeonnam", "전라남도", "남도 섬, 정원, 근대역사, 차밭 여행지", [
        area("jeonnam-west", "목포·신안", "근대 도시와 섬", [
          place("목포근대역사관", "역사", "일제강점기 근대 건축과 목포 도시사를 볼 수 있습니다.", "근대사", "원도심 연계"),
          place("유달산", "자연", "목포 시내와 바다를 내려다보는 가벼운 산책 명소입니다.", "전망", "운동화 추천"),
          place("퍼플섬", "랜드마크", "보라색 마을 경관과 섬 산책으로 알려진 신안 명소입니다.", "사진", "교통 확인"),
          place("천사대교", "랜드마크", "신안 섬들을 잇는 해상 교량 드라이브 코스입니다.", "드라이브", "날씨 확인")
        ]),
        area("jeonnam-east", "순천·여수·광양", "정원, 밤바다, 봄꽃", [
          place("순천만국가정원·순천만습지", "자연", "정원과 갈대 습지를 함께 보는 전남 대표 생태 관광지입니다.", "자연", "반나절 이상"),
          place("여수 오동도", "자연", "동백 숲과 해안 산책로가 좋은 여수 대표 명소입니다.", "바다 산책", "무료 구간"),
          place("여수밤바다·해상케이블카", "랜드마크", "야경과 바다 전망을 함께 즐기는 여수 대표 코스입니다.", "야경", "운영 확인"),
          place("광양매화마을", "자연", "봄 매화 풍경으로 유명한 섬진강권 명소입니다.", "봄꽃", "시즌 혼잡")
        ]),
        area("jeonnam-south", "담양·보성·해남·완도", "숲길, 차밭, 땅끝", [
          place("죽녹원", "자연", "대나무 숲길을 걸으며 쉬기 좋은 담양 대표 명소입니다.", "산책", "입장료 확인"),
          place("메타세쿼이아길", "자연", "담양의 대표 가로수길로 사진과 산책에 좋습니다.", "사진", "계절 추천"),
          place("보성녹차밭", "자연", "차밭 능선 풍경과 녹차 문화를 함께 즐길 수 있습니다.", "사진", "계절 추천"),
          place("땅끝마을", "랜드마크", "한반도 남쪽 끝 상징성과 바다 전망을 보는 해남 명소입니다.", "전망", "이동 시간 확보")
        ])
      ]),
      region("gyeongbuk", "경상북도", "신라, 유교, 동해 섬 관광의 핵심 권역", [
        area("gyeongbuk-gyeongju", "경주", "신라 왕경 유적", [
          place("불국사", "역사", "신라 불교문화의 대표 사찰이자 세계유산입니다.", "역사", "석굴암 연계"),
          place("석굴암", "역사", "토함산의 대표 불교 유산으로 불국사와 함께 보기 좋습니다.", "역사", "예약/교통 확인"),
          place("대릉원·첨성대", "역사", "신라 고분과 천문 유적을 도보로 묶어 보기 좋습니다.", "도보 탐방", "야간 조명"),
          place("월정교·동궁과 월지", "랜드마크", "경주 야경 코스로 유명한 신라 왕경권 명소입니다.", "야경", "저녁 추천"),
          place("황리단길", "거리·시장", "카페와 식당, 한옥 골목이 모인 경주 중심 상권입니다.", "친구 모임", "혼잡 주의")
        ]),
        area("gyeongbuk-andong", "안동·영주", "유교 문화와 전통 마을", [
          place("안동 하회마을", "역사", "전통 가옥과 낙동강 물돌이 풍경이 있는 세계유산 마을입니다.", "역사", "부용대 연계"),
          place("병산서원", "역사", "낙동강 풍경과 서원 건축미가 좋은 안동 대표 유산입니다.", "역사", "교통 확인"),
          place("도산서원", "역사", "퇴계 이황의 학문 공간으로 유교 문화 탐방에 좋습니다.", "역사", "안동 외곽"),
          place("부석사", "역사", "무량수전으로 유명한 영주 대표 산사 문화유산입니다.", "사찰", "가을 추천"),
          place("소수서원", "역사", "한국 최초 사액서원으로 선비촌과 함께 보기 좋습니다.", "역사", "영주 코스")
        ]),
        area("gyeongbuk-east", "포항·울릉", "동해, 섬, 일출", [
          place("호미곶", "랜드마크", "상생의 손과 동해 일출로 유명한 포항 대표 명소입니다.", "일출", "날씨 확인"),
          place("영일대해수욕장", "자연", "포항 도심 해변과 야경을 함께 즐기기 좋습니다.", "바다", "저녁 추천"),
          place("울릉도", "자연", "해안 절경과 독특한 섬 지형을 볼 수 있는 동해 대표 섬입니다.", "섬 여행", "배편 확인"),
          place("독도", "역사", "대한민국 동쪽 끝 섬이자 상징성이 큰 역사·자연 명소입니다.", "상징 명소", "입도 조건 확인")
        ]),
        area("gyeongbuk-north", "문경·청송·봉화", "고갯길과 산악 자연", [
          place("문경새재", "역사", "조선시대 영남대로 고갯길을 걷는 대표 역사 산책지입니다.", "걷기", "반나절 코스"),
          place("주왕산국립공원", "자연", "기암과 계곡 풍경이 강한 청송 대표 산악 명소입니다.", "트레킹", "코스 확인"),
          place("국립백두대간수목원", "자연", "봉화의 대형 수목원으로 숲과 식물 전시가 강합니다.", "자연", "입장료 확인")
        ])
      ]),
      region("gyeongnam", "경상남도", "남해안, 가야, 사찰, 진주성 문화권", [
        area("gyeongnam-east", "창원·김해", "가야 역사와 항구 도시", [
          place("진해 여좌천·경화역", "자연", "봄 벚꽃으로 유명한 창원 대표 산책 코스입니다.", "봄꽃", "시즌 혼잡"),
          place("마산어시장", "거리·시장", "항구 도시 먹거리와 시장 분위기를 느낄 수 있습니다.", "먹거리", "가격 확인"),
          place("김해 수로왕릉", "역사", "가야 역사와 김해 도심 산책을 함께 볼 수 있습니다.", "역사", "짧은 코스"),
          place("김해가야테마파크", "문화", "가야 문화 체험과 공연을 결합한 가족·친구 나들이지입니다.", "체험", "운영 확인")
        ]),
        area("gyeongnam-south", "통영·거제", "한려수도와 섬 풍경", [
          place("동피랑벽화마을", "랜드마크", "통영항을 내려다보는 벽화 골목 산책지입니다.", "사진", "주거지 배려"),
          place("한려수도조망케이블카", "랜드마크", "통영 바다와 섬 전망을 한눈에 보는 대표 명소입니다.", "전망", "운영 확인"),
          place("거제 바람의언덕", "자연", "바다와 풍차 풍경이 인상적인 거제 대표 포토 명소입니다.", "사진", "바람 주의"),
          place("외도 보타니아", "자연", "섬 정원과 해상 관광을 함께 즐기는 거제 명소입니다.", "섬 여행", "배편 확인")
        ]),
        area("gyeongnam-west", "진주·합천·산청·함양", "성곽, 산사, 치유 여행", [
          place("진주성", "역사", "임진왜란 역사를 품은 남강변 대표 성곽 유적입니다.", "역사", "야경 좋음"),
          place("합천 해인사", "역사", "팔만대장경을 보관한 장경판전으로 유명한 세계유산 사찰입니다.", "사찰", "산사 예절"),
          place("산청 동의보감촌", "문화", "한방과 휴식을 테마로 한 산청 대표 체류형 관광지입니다.", "휴식", "운영 확인"),
          place("함양 남계서원", "역사", "한국의 서원 중 하나로 유교 문화 탐방에 좋습니다.", "역사", "조용한 코스")
        ])
      ]),
      region("jeju", "제주특별자치도", "화산 지형, 오름, 해안, 숲길이 강한 섬", [
        area("jeju-north", "제주시·북부", "한라산과 도심 해안", [
          place("한라산국립공원", "자연", "제주의 중심 산악 명소로 등산 코스별 난이도를 확인해야 합니다.", "등산", "예약/날씨 확인"),
          place("용두암", "랜드마크", "제주시 가까이에서 바다와 화산암 경관을 볼 수 있습니다.", "짧은 산책", "무료"),
          place("동문시장", "거리·시장", "제주 먹거리와 야시장을 즐기는 도심 시장입니다.", "먹거리", "저녁 추천"),
          place("협재해수욕장", "자연", "맑은 바다와 비양도 전망이 좋은 서부 해변입니다.", "바다", "성수기 혼잡")
        ]),
        area("jeju-east", "성산·구좌·우도", "일출봉, 오름, 섬", [
          place("성산일출봉", "자연", "유네스코 세계자연유산으로 일출과 분화구 전망이 유명합니다.", "일출", "운영 확인"),
          place("우도", "자연", "섬 안에서 해변과 등대, 로컬 먹거리를 즐기는 동부 대표 코스입니다.", "섬 여행", "배편 확인"),
          place("섭지코지", "자연", "해안 절벽과 초지 풍경이 인상적인 성산권 산책지입니다.", "사진", "바람 주의"),
          place("비자림", "자연", "오래된 비자나무 숲길을 조용히 걷기 좋은 구좌 명소입니다.", "숲길", "입장료 확인")
        ]),
        area("jeju-south", "서귀포·중문", "폭포와 해안 절경", [
          place("천지연폭포", "자연", "서귀포 도심 가까이에서 폭포와 야간 산책을 즐길 수 있습니다.", "산책", "운영 확인"),
          place("정방폭포", "자연", "바다로 떨어지는 폭포 풍경을 볼 수 있는 대표 명소입니다.", "자연", "안전 주의"),
          place("중문관광단지", "랜드마크", "해변, 박물관, 호텔권이 모인 서귀포 대표 관광권입니다.", "종일 코스", "동선 계획"),
          place("주상절리대", "자연", "화산 지형이 만든 해안 절벽을 볼 수 있는 중문권 명소입니다.", "지질", "운영 확인")
        ]),
        area("jeju-west", "안덕·대정·한림", "차밭, 산방산, 숲길", [
          place("오설록 티뮤지엄", "문화", "차밭 풍경과 실내 전시, 카페를 함께 즐길 수 있습니다.", "실내외", "혼잡 주의"),
          place("산방산·용머리해안", "자연", "화산 지형과 해안 절경을 함께 보는 서남부 대표 코스입니다.", "자연", "기상 통제 확인"),
          place("송악산", "자연", "해안 둘레길과 산방산, 마라도 방향 전망이 좋은 산책지입니다.", "걷기", "바람 주의"),
          place("머체왓숲길", "자연", "조용한 숲길 산책과 제주의 내륙 풍경을 즐기기 좋습니다.", "숲길", "운동화 추천")
        ])
      ])
    ]
  }
];

const state = {
  typeId: PLACE_DATA[0].id,
  regionId: PLACE_DATA[0].regions[0].id,
  areaId: PLACE_DATA[0].regions[0].areas[0].id,
  filter: "all"
};

bindEvents();
renderAll();

function bindEvents() {
  placeTypeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-id]");
    if (!button) {
      return;
    }
    selectType(button.dataset.typeId);
  });

  placeRegionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-region-id]");
    if (!button) {
      return;
    }
    selectRegion(button.dataset.regionId);
  });

  placeAreaList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-area-id]");
    if (!button) {
      return;
    }
    state.areaId = button.dataset.areaId;
    placeSearch.value = "";
    renderAll();
  });

  placeSearch.addEventListener("input", () => {
    renderPlaces();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.placeFilter || "all";
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderPlaces();
    });
  });
}

function selectType(typeId) {
  const type = PLACE_DATA.find((entry) => entry.id === typeId) || PLACE_DATA[0];
  const region = type.regions[0];
  state.typeId = type.id;
  state.regionId = region.id;
  state.areaId = region.areas[0].id;
  placeSearch.value = "";
  renderAll();
}

function selectRegion(regionId) {
  const type = getSelectedType();
  const region = type.regions.find((entry) => entry.id === regionId) || type.regions[0];
  state.regionId = region.id;
  state.areaId = region.areas[0].id;
  placeSearch.value = "";
  renderAll();
}

function renderAll() {
  renderTypeList();
  renderRegionList();
  renderAreaList();
  renderSummary();
  renderPlaces();
}

function renderTypeList() {
  placeTypeList.innerHTML = "";
  PLACE_DATA.forEach((type) => {
    placeTypeList.append(createSelectorButton(type, "type", type.id === state.typeId, countPlacesInType(type)));
  });
}

function renderRegionList() {
  const type = getSelectedType();
  placeRegionList.innerHTML = "";
  type.regions.forEach((regionEntry) => {
    placeRegionList.append(createSelectorButton(regionEntry, "region", regionEntry.id === state.regionId, countPlacesInRegion(regionEntry)));
  });
}

function renderAreaList() {
  const regionEntry = getSelectedRegion();
  placeAreaList.innerHTML = "";
  regionEntry.areas.forEach((areaEntry) => {
    placeAreaList.append(createSelectorButton(areaEntry, "area", areaEntry.id === state.areaId, areaEntry.places.length));
  });
}

function renderSummary() {
  const type = getSelectedType();
  const regionEntry = getSelectedRegion();
  const areaEntry = getSelectedArea();
  placeSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(areaEntry.label)}</strong>
      <span>${escapeHtml(type.label)} · ${escapeHtml(regionEntry.label)}</span>
    </div>
    <p>${escapeHtml(areaEntry.description)}</p>
  `;
}

function renderPlaces() {
  const query = normalize(placeSearch.value);
  const areaEntry = getSelectedArea();
  const sourcePlaces = query ? getAllPlaces() : areaEntry.places.map((entry) => ({ ...entry, areaLabel: areaEntry.label, regionLabel: getSelectedRegion().label }));
  const filtered = sourcePlaces.filter((entry) => {
    const matchesFilter = state.filter === "all" || entry.type === state.filter;
    const haystack = normalize(`${entry.name} ${entry.type} ${entry.description} ${entry.mood} ${entry.note} ${entry.areaLabel} ${entry.regionLabel}`);
    return matchesFilter && (!query || haystack.includes(query));
  });

  placeCardGrid.innerHTML = "";
  placeCount.textContent = `${filtered.length}곳`;
  placeEmpty.classList.toggle("hidden", filtered.length !== 0);

  filtered.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "place-card";
    article.innerHTML = `
      <div class="place-card-topline">
        <span class="tip-category">${escapeHtml(entry.type)}</span>
        <span class="metric-label">${escapeHtml(entry.regionLabel)} · ${escapeHtml(entry.areaLabel)}</span>
      </div>
      <h3>${escapeHtml(entry.name)}</h3>
      <p>${escapeHtml(entry.description)}</p>
      <div class="place-meta-row">
        <span>${escapeHtml(entry.mood)}</span>
        <span>${escapeHtml(entry.note)}</span>
      </div>
    `;
    placeCardGrid.append(article);
  });
}

function createSelectorButton(entry, level, isActive, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `category-button ${isActive ? "active" : ""}`;
  button.dataset[`${level}Id`] = entry.id;
  button.innerHTML = `
    <strong>${escapeHtml(entry.label)}</strong>
    <span>${escapeHtml(entry.description)} · ${count}곳</span>
  `;
  return button;
}

function getAllPlaces() {
  return PLACE_DATA.flatMap((type) =>
    type.regions.flatMap((regionEntry) =>
      regionEntry.areas.flatMap((areaEntry) =>
        areaEntry.places.map((entry) => ({
          ...entry,
          typeLabel: type.label,
          regionLabel: regionEntry.label,
          areaLabel: areaEntry.label
        }))
      )
    )
  );
}

function getSelectedType() {
  return PLACE_DATA.find((entry) => entry.id === state.typeId) || PLACE_DATA[0];
}

function getSelectedRegion() {
  const type = getSelectedType();
  return type.regions.find((entry) => entry.id === state.regionId) || type.regions[0];
}

function getSelectedArea() {
  const regionEntry = getSelectedRegion();
  return regionEntry.areas.find((entry) => entry.id === state.areaId) || regionEntry.areas[0];
}

function countPlacesInType(type) {
  return type.regions.reduce((sum, regionEntry) => sum + countPlacesInRegion(regionEntry), 0);
}

function countPlacesInRegion(regionEntry) {
  return regionEntry.areas.reduce((sum, areaEntry) => sum + areaEntry.places.length, 0);
}

function region(id, label, description, areas) {
  return { id, label, description, areas };
}

function area(id, label, description, places) {
  return { id, label, description, places };
}

function place(name, type, description, mood, note) {
  return { name, type, description, mood, note };
}

function normalize(value) {
  return String(value).trim().toLocaleLowerCase("ko-KR");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
