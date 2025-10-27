// 定数定義
const ORIGIN_ZIPCODE = '986-0814';
const ORIGIN_IC = '石巻河南'; // 出発IC（固定）
const NUM_WORKERS = 2;
const HIGHWAY_COST_PER_KM = 24.6; // 円/km（普通車・ETC料金の概算）

// 宮城県内の市区町村とICのマッピング
const MIYAGI_IC_MAP = {
    // 仙台市
    '仙台市青葉区': '仙台宮城',
    '仙台市宮城野区': '仙台港北',
    '仙台市若林区': '仙台南',
    '仙台市太白区': '仙台南',
    '仙台市泉区': '泉',
    
    // 石巻圏
    '石巻市': '石巻河南',
    '東松島市': '松島海岸',
    '女川町': '石巻河南',
    
    // 大崎圏
    '大崎市': '古川',
    '色麻町': '古川',
    '加美町': '古川',
    '涌谷町': '松島大郷',
    '美里町': '松島大郷',
    
    // 栗原圏
    '栗原市': '築館',
    
    // 登米圏
    '登米市': '登米',
    
    // 気仙沼圏
    '気仙沼市': '気仙沼鹿折金山',
    '南三陸町': '気仙沼鹿折金山',
    
    // 名取・岩沼
    '名取市': '仙台南',
    '岩沼市': '岩沼',
    
    // 白石・角田
    '白石市': '白石',
    '角田市': '村田',
    '蔵王町': '白石',
    '七ヶ宿町': '白石',
    '大河原町': '村田',
    '村田町': '村田',
    '柴田町': '村田',
    '川崎町': '村田',
    
    // 黒川郡
    '富谷市': '富谷',
    '大和町': '大和',
    '大郷町': '松島大郷',
    '大衡村': '大衡',
    
    // 宮城郡
    '松島町': '松島海岸',
    '七ヶ浜町': '仙台港北',
    '利府町': '利府中',
    
    // 塩竈・多賀城
    '塩竈市': '利府中',
    '多賀城市': '仙台港北',
    
    // 亘理・山元
    '亘理町': '亘理',
    '山元町': '山元',
    
    // 本吉郡
    '本吉町': '気仙沼鹿折金山'
};

// 設定から値を取得する関数
function getSettings() {
    return {
        gasPrice: parseFloat(document.getElementById('gasPrice').value) || 167,
        fuelEfficiency: parseFloat(document.getElementById('fuelEfficiency').value) || 15,
        hourlyWage: parseFloat(document.getElementById('hourlyWage').value) || 1300,
        profitMargin: parseFloat(document.getElementById('profitMargin').value) || 25,
        useHighway: document.getElementById('useHighway').checked
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
            const city = result.address2;
            return { address, prefecture, city };
        } else {
            throw new Error('郵便番号が見つかりませんでした');
        }
    } catch (error) {
        throw new Error('郵便番号の検索に失敗しました: ' + error.message);
    }
}

// 宮城県内の市区町村から最寄りのICを取得
function getNearestIC(city) {
    // 市区町村名を正規化（「〜市」「〜町」「〜村」を含む）
    for (const [key, ic] of Object.entries(MIYAGI_IC_MAP)) {
        if (city.includes(key) || key.includes(city)) {
            return ic;
        }
    }
    // デフォルトは仙台宮城IC
    return '仙台宮城';
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
        const { address: destAddress, prefecture, city } = await getAddressFromZipcode(destinationZipcode);
        
        // 1.5. 宮城県内かチェック
        if (prefecture !== '宮城県') {
            showError('このシステムは宮城県内専用です。宮城県内の郵便番号を入力してください。');
            return;
        }
        
        // 1.6. 最寄りのICとドラぷらURLを生成
        const destinationIC = getNearestIC(city);
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
        let oneWayHighwayCost = 0;
        let highwayCost = 0;
        
        if (settings.useHighway) {
            oneWayHighwayCost = distance * HIGHWAY_COST_PER_KM;
            highwayCost = oneWayHighwayCost * 3;
        }
        
        // 直接経費の合計
        const directCost = laborCost + gasCost + highwayCost;
        
        // 利益 = 直接経費 × 利益率
        const profit = directCost * (settings.profitMargin / 100);
        
        // 最終的な配送料金
        const totalCost = directCost + profit;
        
        // 結果を表示
        displayResult({
            destAddress,
            city,
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
    document.getElementById('destinationIC').textContent = `${data.destinationIC}IC（${data.city}）`;
    document.getElementById('distance').textContent = `${data.distance.toFixed(1)} km`;
    document.getElementById('duration').textContent = `${data.duration.toFixed(1)} 時間`;
    
    // ドラぷらリンクを設定（高速道路使用時のみ表示）
    const highwayLinkBox = document.querySelector('.highway-link-box');
    if (data.settings.useHighway) {
        const highwayLink = document.getElementById('highwayLink');
        highwayLink.href = data.drivePlazaURL;
        highwayLinkBox.style.display = 'block';
    } else {
        highwayLinkBox.style.display = 'none';
    }
    
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
