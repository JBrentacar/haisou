// 定数定義
const ORIGIN_ZIPCODE = '986-0814';
const ORIGIN_IC = '石巻河南'; // 出発IC（固定）
const NUM_WORKERS = 2;
const HIGHWAY_COST_PER_KM = 24.6; // 円/km（普通車・ETC料金の概算）

// 都道府県別の主要ICマッピング
const PREFECTURE_IC_MAP = {
    '北海道': '札幌',
    '青森県': '青森',
    '岩手県': '盛岡',
    '宮城県': '仙台宮城',
    '秋田県': '秋田中央',
    '山形県': '山形',
    '福島県': '福島西',
    '茨城県': '水戸',
    '栃木県': '宇都宮',
    '群馬県': '前橋',
    '埼玉県': '浦和',
    '千葉県': '千葉',
    '東京都': '東京',
    '神奈川県': '横浜',
    '新潟県': '新潟中央',
    '富山県': '富山',
    '石川県': '金沢西',
    '福井県': '福井',
    '山梨県': '甲府昭和',
    '長野県': '長野',
    '岐阜県': '岐阜羽島',
    '静岡県': '静岡',
    '愛知県': '名古屋',
    '三重県': '四日市',
    '滋賀県': '草津田上',
    '京都府': '京都南',
    '大阪府': '吹田',
    '兵庫県': '神戸',
    '奈良県': '天理',
    '和歌山県': '和歌山',
    '鳥取県': '鳥取',
    '島根県': '松江',
    '岡山県': '岡山',
    '広島県': '広島',
    '山口県': '山口',
    '徳島県': '徳島',
    '香川県': '高松中央',
    '愛媛県': '松山',
    '高知県': '高知',
    '福岡県': '福岡',
    '佐賀県': '佐賀大和',
    '長崎県': '長崎多良見',
    '熊本県': '熊本',
    '大分県': '大分',
    '宮崎県': '宮崎',
    '鹿児島県': '鹿児島',
    '沖縄県': '那覇'
};

// 設定から値を取得する関数
function getSettings() {
    return {
        gasPrice: parseFloat(document.getElementById('gasPrice').value) || 167,
        fuelEfficiency: parseFloat(document.getElementById('fuelEfficiency').value) || 15,
        hourlyWage: parseFloat(document.getElementById('hourlyWage').value) || 1300,
        profitMargin: parseFloat(document.getElementById('profitMargin').value) || 25
    };
}

// 郵便番号から住所を取得
async function getAddressFromZipcode(zipcode) {
    // ハイフンを除去
    const cleanZipcode = zipcode.replace(/-/g, '');
    
    try {
        // 郵便番号検索API（無料）を使用
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanZipcode}`);
        const data = await response.json();
        
        if (data.status === 200 && data.results) {
            const result = data.results[0];
            const address = `${result.address1}${result.address2}${result.address3}`;
            const prefecture = result.address1;
            return { address, prefecture };
        } else {
            throw new Error('郵便番号が見つかりませんでした');
        }
    } catch (error) {
        throw new Error('郵便番号の検索に失敗しました: ' + error.message);
    }
}

// 都道府県から最寄りのICを取得
function getNearestIC(prefecture) {
    return PREFECTURE_IC_MAP[prefecture] || '東京';
}

// ドラぷらの料金検索URLを生成
function generateDrivePlazaURL(destinationIC) {
    const now = new Date();
    const params = new URLSearchParams({
        startPlaceKana: ORIGIN_IC,
        arrivePlaceKana: destinationIC,
        searchHour: '12',
        searchMinute: '00',
        kind: '1',          // 1: 料金優先
        carType: '1',       // 1: 軽自動車等・普通車
        priority: '2',      // 2: ETC
        searchYear: now.getFullYear().toString(),
        searchMonth: (now.getMonth() + 1).toString(),
        searchDay: now.getDate().toString(),
        selectickindflg: '0'
    });
    
    return `https://www.driveplaza.com/dp/SearchQuick?${params.toString()}`;
}

// 距離と時間を計算（Google Maps APIの代わりに概算計算を使用）
async function calculateDistanceAndTime(originAddress, destAddress) {
    try {
        // 実際のアプリケーションではGoogle Maps APIを使用しますが、
        // ここでは無料で使えるOpenStreetMap Nominatim APIで座標を取得し、
        // 直線距離から道路距離を推定します
        
        const originCoords = await getCoordinates(originAddress);
        const destCoords = await getCoordinates(destAddress);
        
        // 2点間の直線距離を計算（Haversine formula）
        const straightDistance = calculateHaversineDistance(
            originCoords.lat, originCoords.lon,
            destCoords.lat, destCoords.lon
        );
        
        // 道路距離は直線距離の約1.3倍と仮定
        const roadDistance = straightDistance * 1.3;
        
        // 高速道路使用時の平均速度を80km/hと仮定
        const travelTime = roadDistance / 80;
        
        return {
            distance: roadDistance,
            duration: travelTime
        };
    } catch (error) {
        throw new Error('距離の計算に失敗しました: ' + error.message);
    }
}

// 住所から座標を取得
async function getCoordinates(address) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'DeliveryCostCalculator/1.0'
                }
            }
        );
        const data = await response.json();
        
        if (data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        } else {
            throw new Error('住所の座標が見つかりませんでした');
        }
    } catch (error) {
        throw new Error('座標の取得に失敗しました: ' + error.message);
    }
}

// Haversine公式で2点間の距離を計算
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球の半径（km）
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

// 配送料金を計算
async function calculateDeliveryCost() {
    const destinationZipcode = document.getElementById('destination').value.trim();
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const calculateBtn = document.getElementById('calculateBtn');
    
    // 入力チェック
    if (!destinationZipcode) {
        showError('配送先の郵便番号を入力してください');
        return;
    }
    
    // 郵便番号の形式チェック
    const zipcodePattern = /^\d{3}-?\d{4}$/;
    if (!zipcodePattern.test(destinationZipcode)) {
        showError('正しい郵便番号の形式で入力してください（例: 100-0001）');
        return;
    }
    
    // UI更新
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    calculateBtn.disabled = true;
    
    try {
        // 0. 設定を取得
        const settings = getSettings();
        
        // 1. 住所を取得
        const originAddress = '宮城県石巻市南光町2丁目';
        const { address: destAddress, prefecture } = await getAddressFromZipcode(destinationZipcode);
        
        // 1.5. 最寄りのICとドラぷらURLを生成
        const destinationIC = getNearestIC(prefecture);
        const drivePlazaURL = generateDrivePlazaURL(destinationIC);
        
        // 2. 距離と時間を計算
        const { distance, duration } = await calculateDistanceAndTime(originAddress, destAddress);
        
        // 3. 各費用を計算
        const roundTripDistance = distance * 2; // 往復距離
        const roundTripDuration = duration * 2; // 往復時間
        
        // 人件費 = 往復時間 × 時給 × 2人
        const laborCost = roundTripDuration * settings.hourlyWage * NUM_WORKERS;
        
        // ガソリン代 = 往復距離 ÷ 燃費 × ガソリン単価（スタッフ車のみ）
        const gasCost = (roundTripDistance / settings.fuelEfficiency) * settings.gasPrice;
        
        // 高速道路料金 = 片道料金 × 3（往路2台 + 復路1台）
        const oneWayHighwayCost = distance * HIGHWAY_COST_PER_KM;
        const highwayCost = oneWayHighwayCost * 3;
        
        // 直接経費の合計
        const directCost = laborCost + gasCost + highwayCost;
        
        // 利益 = 直接経費 × 利益率
        const profit = directCost * (settings.profitMargin / 100);
        
        // 最終的な配送料金
        const totalCost = directCost + profit;
        
        // 結果を表示
        displayResult({
            destAddress,
            prefecture,
            destinationIC,
            drivePlazaURL,
            distance,
            duration,
            roundTripDistance,
            roundTripDuration,
            laborCost,
            gasCost,
            highwayCost,
            oneWayHighwayCost,
            directCost,
            profit,
            totalCost,
            settings
        });
        
    } catch (error) {
        showError(error.message);
    } finally {
        loadingDiv.style.display = 'none';
        calculateBtn.disabled = false;
    }
}

// 結果を表示
function displayResult(data) {
    // ルート情報
    document.getElementById('destAddress').textContent = data.destAddress;
    document.getElementById('destinationIC').textContent = `${data.destinationIC}IC（${data.prefecture}）`;
    document.getElementById('distance').textContent = `${data.distance.toFixed(1)} km`;
    document.getElementById('duration').textContent = `${data.duration.toFixed(1)} 時間`;
    
    // ドラぷらリンクを設定
    const highwayLink = document.getElementById('highwayLink');
    highwayLink.href = data.drivePlazaURL;
    
    // 直接経費
    document.getElementById('laborCost').textContent = `¥${Math.round(data.laborCost).toLocaleString()}`;
    document.getElementById('laborFormula').textContent = 
        `└ 往復時間 × ¥${data.settings.hourlyWage.toLocaleString()}/時 × 2人`;
    document.getElementById('laborDetail').textContent = 
        `${data.roundTripDuration.toFixed(1)}h × ¥${data.settings.hourlyWage.toLocaleString()} × 2人`;
    
    document.getElementById('gasCost').textContent = `¥${Math.round(data.gasCost).toLocaleString()}`;
    document.getElementById('gasFormula').textContent = 
        `└ 往復距離 ÷ ${data.settings.fuelEfficiency}km/L × ¥${data.settings.gasPrice.toLocaleString()}/L`;
    document.getElementById('gasDetail').textContent = 
        `${data.roundTripDistance.toFixed(1)}km ÷ ${data.settings.fuelEfficiency} × ¥${data.settings.gasPrice}`;
    
    document.getElementById('highwayCost').textContent = `¥${Math.round(data.highwayCost).toLocaleString()}`;
    document.getElementById('highwayDetail').textContent = 
        `¥${Math.round(data.oneWayHighwayCost).toLocaleString()} × 3`;
    
    document.getElementById('directCost').textContent = `¥${Math.round(data.directCost).toLocaleString()}`;
    
    // 利益
    document.getElementById('profitLabel').textContent = 
        `利益（直接経費の${data.settings.profitMargin}%）：`;
    document.getElementById('profitAmount').textContent = `¥${Math.round(data.profit).toLocaleString()}`;
    
    // 合計
    document.getElementById('totalCost').textContent = `¥${Math.round(data.totalCost).toLocaleString()}`;
    document.getElementById('totalFormula').textContent = 
        `(直接経費 ¥${Math.round(data.directCost).toLocaleString()} + 利益 ¥${Math.round(data.profit).toLocaleString()})`;
    
    document.getElementById('result').style.display = 'block';
}

// エラーを表示
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    document.getElementById('result').style.display = 'none';
}

// Enterキーで計算
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('destination').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            calculateDeliveryCost();
        }
    });
});
