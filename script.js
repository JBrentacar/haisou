// 定数定義
const ORIGIN_ZIPCODE = '986-0814';
const ORIGIN_ADDRESS = '宮城県石巻市南中里2丁目9-27'; // 出発地（固定）
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

// 郵便番号から住所を取得（郵便番号APIを使用）
async function getAddressFromZipcode(zipcode) {
    // ハイフンを除去
    const cleanZipcode = zipcode.replace(/-/g, '');
    
    try {
        // 郵便番号検索API（無料）を使用
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanZipcode}`);
        const data = await response.json();
        
        if (data.status === 200 && data.results) {
            const result = data.results[0];
            // 都道府県 + 市区町村 + 町域 を結合して完全な住所を作成
            const address = `${result.address1}${result.address2}${result.address3}`;
            const prefecture = result.address1;
            const city = result.address2;
            return { 
                address, 
                prefecture, 
                city,
                fullAddress: address  // Google Maps APIで使用する完全な住所
            };
        } else {
            throw new Error('郵便番号が見つかりませんでした');
        }
    } catch (error) {
        throw new Error('郵便番号の検索に失敗しました: ' + error.message);
    }
}

// Google Geocoding APIを使用して郵便番号から正確な住所を取得（オプション）
async function getFullAddressFromZipcode(zipcode) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        
        geocoder.geocode({ 
            address: zipcode,
            region: 'JP',
            componentRestrictions: {
                country: 'JP',
                postalCode: zipcode.replace(/-/g, '')
            }
        }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const addressComponents = results[0].address_components;
                let prefecture = '';
                let city = '';
                
                // 住所コンポーネントから都道府県と市区町村を抽出
                addressComponents.forEach(component => {
                    if (component.types.includes('administrative_area_level_1')) {
                        prefecture = component.long_name;
                    }
                    if (component.types.includes('locality') || component.types.includes('administrative_area_level_2')) {
                        city = component.long_name;
                    }
                });
                
                resolve({
                    address: results[0].formatted_address,
                    prefecture: prefecture,
                    city: city,
                    fullAddress: results[0].formatted_address,
                    location: results[0].geometry.location
                });
            } else {
                reject(new Error('住所が見つかりませんでした: ' + status));
            }
        });
    });
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

// Geocoding APIで住所を座標に変換
async function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address, region: 'JP' }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location;
                resolve({
                    lat: location.lat(),
                    lng: location.lng()
                });
            } else {
                reject(new Error('住所のジオコーディングに失敗しました: ' + status));
            }
        });
    });
}

// Google Maps Routes APIを使用して距離・時間・料金を計算
async function calculateDistanceAndTime(originAddress, destAddress, useHighway) {
    try {
        // Geocoding APIで住所を座標に変換
        const originCoords = await geocodeAddress(originAddress);
        const destCoords = await geocodeAddress(destAddress);
        
        console.log('=== Google Maps Routes API リクエスト ===');
        console.log('Origin:', originAddress, originCoords);
        console.log('Destination:', destAddress, destCoords);
        console.log('Use Highway:', useHighway);
        
        // Routes APIを使用（REST API）
        const requestBody = {
            origin: {
                location: {
                    latLng: {
                        latitude: originCoords.lat,
                        longitude: originCoords.lng
                    }
                }
            },
            destination: {
                location: {
                    latLng: {
                        latitude: destCoords.lat,
                        longitude: destCoords.lng
                    }
                }
            },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            computeAlternativeRoutes: false,
            routeModifiers: {
                avoidTolls: !useHighway,
                avoidHighways: !useHighway,
                vehicleInfo: {
                    emissionType: "GASOLINE"
                }
            },
            languageCode: "ja",
            units: "METRIC",
            extraComputations: ["TOLLS"]  // 料金情報をリクエスト
        };
        
        console.log('Request Body:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': 'AIzaSyBFYB0bBR_kDQNp2D0cxWocUrCs2Y8IvHE',
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Routes API Error:', response.status, errorText);
            throw new Error(`Routes API Error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('=== Google Maps Routes API レスポンス ===');
        console.log('Full Response:', JSON.stringify(data, null, 2));
        
        // レスポンスの検証
        if (!data.routes || data.routes.length === 0) {
            throw new Error('ルートが見つかりませんでした');
        }
        
        const route = data.routes[0];
        
        // 距離と時間を取得
        const distanceMeters = route.distanceMeters || 0;
        const durationSeconds = route.duration ? parseFloat(route.duration.replace('s', '')) : 0;
        
        const distance = distanceMeters / 1000; // メートル → km
        const duration = durationSeconds / 3600; // 秒 → 時間
        
        // 距離と時間を読みやすいテキスト形式に変換
        const distanceText = `${distance.toFixed(1)} km`;
        const durationMinutes = Math.round(durationSeconds / 60);
        const durationText = `${durationMinutes} 分`;
        
        console.log('Distance:', distanceMeters, 'meters =', distance.toFixed(1), 'km');
        console.log('Duration:', durationSeconds, 'seconds =', duration.toFixed(2), 'hours =', durationMinutes, 'minutes');
        
        // 通行料金を取得
        let tollFee = null;
        let tollCurrency = 'JPY';
        let tollInfo = null;
        
        // Routes APIのtollInfo から料金を取得
        if (route.travelAdvisory && route.travelAdvisory.tollInfo) {
            const tollInfoData = route.travelAdvisory.tollInfo;
            console.log('Toll Info:', JSON.stringify(tollInfoData, null, 2));
            
            // estimatedPrice配列から料金を取得
            if (tollInfoData.estimatedPrice && tollInfoData.estimatedPrice.length > 0) {
                const priceInfo = tollInfoData.estimatedPrice[0];
                // unitsがナノ単位（10^-9）の場合、実際の金額に変換
                if (priceInfo.units) {
                    tollFee = parseFloat(priceInfo.units);
                    if (priceInfo.nanos) {
                        tollFee += priceInfo.nanos / 1000000000;
                    }
                    tollCurrency = priceInfo.currencyCode || 'JPY';
                    tollInfo = 'Google Routes APIから取得';
                    console.log('✓ 通行料金取得成功:', tollFee, tollCurrency);
                }
            }
        }
        
        // legsレベルのtollInfoもチェック（より詳細な情報がある場合）
        if (!tollFee && route.legs && route.legs[0] && route.legs[0].travelAdvisory && route.legs[0].travelAdvisory.tollInfo) {
            const legTollInfo = route.legs[0].travelAdvisory.tollInfo;
            console.log('Leg Toll Info:', JSON.stringify(legTollInfo, null, 2));
            
            if (legTollInfo.estimatedPrice && legTollInfo.estimatedPrice.length > 0) {
                const priceInfo = legTollInfo.estimatedPrice[0];
                if (priceInfo.units) {
                    tollFee = parseFloat(priceInfo.units);
                    if (priceInfo.nanos) {
                        tollFee += priceInfo.nanos / 1000000000;
                    }
                    tollCurrency = priceInfo.currencyCode || 'JPY';
                    tollInfo = 'Google Routes APIから取得（Leg情報）';
                    console.log('✓ Leg通行料金取得成功:', tollFee, tollCurrency);
                }
            }
        }
        
        if (!tollFee) {
            console.log('ℹ️ 通行料金情報が取得できませんでした');
            console.log('   → NEXCOドラぷらリンクで正確な料金をご確認ください');
            tollInfo = '通行料金情報なし（NEXCOドラぷらで確認推奨）';
        }
        
        console.log('===========================================');
        
        return {
            distance: distance,
            duration: duration,
            distanceText: distanceText,
            durationText: durationText,
            tollFee: tollFee,
            tollCurrency: tollCurrency,
            tollInfo: tollInfo,
            route: route
        };
        
    } catch (error) {
        console.error('calculateDistanceAndTime エラー:', error);
        throw new Error('ルート計算に失敗しました: ' + error.message);
    }
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
        
        // 1. 出発地住所（固定）
        const originAddress = ORIGIN_ADDRESS;
        
        // 2. 配送先の住所を郵便番号から取得
        // まず郵便番号APIで基本情報を取得
        const zipcodeData = await getAddressFromZipcode(destinationZipcode);
        
        // 2.5. 宮城県内かチェック
        if (zipcodeData.prefecture !== '宮城県') {
            showError('このシステムは宮城県内専用です。宮城県内の郵便番号を入力してください。');
            return;
        }
        
        // 3. Google Geocoding APIでより正確な住所を取得（エラー時は郵便番号APIの結果を使用）
        let destAddressInfo;
        try {
            destAddressInfo = await getFullAddressFromZipcode(destinationZipcode);
            // 都道府県が宮城県でない場合は郵便番号APIの結果を使用
            if (!destAddressInfo.prefecture.includes('宮城')) {
                destAddressInfo = {
                    ...zipcodeData,
                    fullAddress: zipcodeData.address
                };
            }
        } catch (error) {
            console.log('Google Geocoding API失敗、郵便番号APIの結果を使用:', error);
            destAddressInfo = {
                ...zipcodeData,
                fullAddress: zipcodeData.address
            };
        }
        
        const destAddress = destAddressInfo.fullAddress;
        const prefecture = destAddressInfo.prefecture;
        const city = destAddressInfo.city;
        
        // 4. 最寄りのICとドラぷらURLを生成
        const destinationIC = getNearestIC(city);
        const drivePlazaURL = generateDrivePlazaURL(destinationIC);
        
        // 5. 距離と時間を計算（Google Maps Directions API使用）
        const { distance, duration, distanceText, durationText, tollFee, route } = await calculateDistanceAndTime(
            originAddress, 
            destAddress, 
            settings.useHighway
        );
        
        // 3. 各費用を計算
        const roundTripDistance = distance * 2; // 往復距離
        const roundTripDuration = duration * 2; // 往復時間
        
        // 人件費 = 往復時間 × 時給 × 2人
        const laborCost = roundTripDuration * settings.hourlyWage * NUM_WORKERS;
        
        // ガソリン代 = 往復距離 ÷ 燃費 × ガソリン単価（スタッフ車のみ）
        const gasCost = (roundTripDistance / settings.fuelEfficiency) * settings.gasPrice;
        
        // 高速道路料金
        let oneWayHighwayCost = 0;
        let highwayCost = 0;
        let googleTollFee = tollFee;
        let hasActualTollFee = false;
        
        if (settings.useHighway) {
            // Google Mapsから通行料金が取得できた場合
            if (tollFee !== null && tollFee > 0) {
                oneWayHighwayCost = tollFee;
                highwayCost = tollFee * 3; // 往路2台分 + 復路1台分
                hasActualTollFee = true;
            } else {
                // 取得できない場合は概算
                oneWayHighwayCost = distance * HIGHWAY_COST_PER_KM;
                highwayCost = oneWayHighwayCost * 3;
                hasActualTollFee = false;
            }
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
            distanceText,
            durationText,
            roundTripDistance,
            roundTripDuration,
            laborCost,
            gasCost,
            highwayCost,
            oneWayHighwayCost,
            hasActualTollFee,
            googleTollFee,
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
    
    // Google Maps APIからの正確な距離と時間を表示
    document.getElementById('distance').textContent = `${data.distanceText} (${data.distance.toFixed(1)} km)`;
    document.getElementById('duration').textContent = `${data.durationText} (${data.duration.toFixed(2)} 時間)`;
    
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
    
    // 高速道路料金の表示（概算）
    if (data.settings.useHighway) {
        document.getElementById('highwayCost').textContent = `¥${Math.round(data.highwayCost).toLocaleString()} (概算)`;
        document.getElementById('highwayDetail').textContent = 
            `¥${Math.round(data.oneWayHighwayCost).toLocaleString()} × 3（概算: ${HIGHWAY_COST_PER_KM}円/km）`;
    } else {
        document.getElementById('highwayCost').textContent = `¥0`;
        document.getElementById('highwayDetail').textContent = '高速道路不使用';
    }
    
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
