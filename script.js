// 定数定義
const ORIGIN_ZIPCODE = '986-0814';
const LABOR_COST_PER_HOUR = 2400;
const NUM_WORKERS = 2;
const FUEL_EFFICIENCY = 8; // km/L
const GAS_PRICE = 180; // 円/L
const HIGHWAY_COST_PER_KM = 24.6; // 円/km（普通車・ETC料金の概算）

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
            return `${result.address1}${result.address2}${result.address3}`;
        } else {
            throw new Error('郵便番号が見つかりませんでした');
        }
    } catch (error) {
        throw new Error('郵便番号の検索に失敗しました: ' + error.message);
    }
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
        // 1. 住所を取得
        const originAddress = '宮城県石巻市南光町2丁目';
        const destAddress = await getAddressFromZipcode(destinationZipcode);
        
        // 2. 距離と時間を計算
        const { distance, duration } = await calculateDistanceAndTime(originAddress, destAddress);
        
        // 3. 各費用を計算
        const roundTripDistance = distance * 2; // 往復距離
        const roundTripDuration = duration * 2; // 往復時間
        
        // 人件費 = 往復時間 × 2400円/時 × 2人
        const laborCost = roundTripDuration * LABOR_COST_PER_HOUR * NUM_WORKERS;
        
        // ガソリン代 = 往復距離 ÷ 8km/L × 180円/L（スタッフ車のみ）
        const gasCost = (roundTripDistance / FUEL_EFFICIENCY) * GAS_PRICE;
        
        // 高速道路料金 = 片道料金 × 3（往路2台 + 復路1台）
        const oneWayHighwayCost = distance * HIGHWAY_COST_PER_KM;
        const highwayCost = oneWayHighwayCost * 3;
        
        // 合計
        const totalCost = laborCost + gasCost + highwayCost;
        
        // 結果を表示
        displayResult({
            destAddress,
            distance,
            duration,
            roundTripDistance,
            roundTripDuration,
            laborCost,
            gasCost,
            highwayCost,
            oneWayHighwayCost,
            totalCost
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
    document.getElementById('destAddress').textContent = data.destAddress;
    document.getElementById('distance').textContent = `${data.distance.toFixed(1)} km`;
    document.getElementById('duration').textContent = `${data.duration.toFixed(1)} 時間`;
    
    document.getElementById('laborCost').textContent = `¥${Math.round(data.laborCost).toLocaleString()}`;
    document.getElementById('laborDetail').textContent = 
        `${data.roundTripDuration.toFixed(1)}h × ¥2,400 × 2人`;
    
    document.getElementById('gasCost').textContent = `¥${Math.round(data.gasCost).toLocaleString()}`;
    document.getElementById('gasDetail').textContent = 
        `${data.roundTripDistance.toFixed(1)}km ÷ 8 × ¥180`;
    
    document.getElementById('highwayCost').textContent = `¥${Math.round(data.highwayCost).toLocaleString()}`;
    document.getElementById('highwayDetail').textContent = 
        `¥${Math.round(data.oneWayHighwayCost).toLocaleString()} × 3`;
    
    document.getElementById('totalCost').textContent = `¥${Math.round(data.totalCost).toLocaleString()}`;
    
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
