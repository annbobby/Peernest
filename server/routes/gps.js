// ============================================================================
// PEERNEST - GPS Routing Engine & Fare Estimator
// ============================================================================

const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Haversine formula for great-circle distance between two GPS coordinates (in km)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Campus road network factor: VIT Vellore has campus perimeter roads and walkways
// Real route walking/cycling distance is on average ~1.22x of straight line distance
const CAMPUS_ROAD_FACTOR = 1.22;

function calculateRouteDistance(lat1, lon1, lat2, lon2) {
  const straightLine = calculateHaversineDistance(lat1, lon1, lat2, lon2);
  return Math.round(straightLine * CAMPUS_ROAD_FACTOR * 100) / 100;
}

// Calculate delivery fare based on pricing settings
function calculateDeliveryFare(totalDistanceKm, isFallback = false) {
  const settings = queryAll("SELECT key, value FROM platform_settings WHERE category IN ('pricing', 'commission')");
  const config = {};
  for (const s of settings) {
    config[s.key] = parseFloat(s.value);
  }

  const baseFee = config.base_delivery_fee || 8.0;
  const pricePerKm = config.price_per_km || 5.0;
  const minFee = config.min_delivery_fee || 10.0;
  const maxFee = config.max_delivery_fee || 120.0;
  const fallbackFee = config.fallback_delivery_fee || 20.0;
  const commissionPercent = config.parcel_commission_percent || 15.0;

  if (isFallback) {
    const fee = fallbackFee;
    const commission = Math.round(fee * (commissionPercent / 100) * 100) / 100;
    const earnings = Math.round((fee - commission) * 100) / 100;
    return {
      isFallback: true,
      distanceKm: 0,
      baseFee: fee,
      kmFee: 0,
      totalFee: fee,
      platformCommission: commission,
      partnerEarnings: earnings
    };
  }

  const roundedDistance = Math.max(0.2, Math.round(totalDistanceKm * 10) / 10);
  const rawKmFee = roundedDistance * pricePerKm;
  let totalFee = baseFee + rawKmFee;

  // Apply minimum and maximum caps
  totalFee = Math.max(minFee, Math.min(maxFee, totalFee));
  totalFee = Math.round(totalFee); // Clean rounding to nearest rupee for campus students

  const platformCommission = Math.max(2, Math.round(totalFee * (commissionPercent / 100)));
  const partnerEarnings = totalFee - platformCommission;

  return {
    isFallback: false,
    distanceKm: roundedDistance,
    baseFee,
    kmFee: Math.round(rawKmFee * 100) / 100,
    totalFee,
    platformCommission,
    partnerEarnings
  };
}

function registerGpsRoutes(router) {
  // 1. GET ALL CAMPUS LOCATIONS
  router.get('/api/gps/locations', (req, res) => {
    const locations = queryAll('SELECT * FROM campus_locations WHERE is_active = 1 ORDER BY type, name');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ locations }));
  });

  // 2. GET ALL HOSTEL LOCATIONS
  router.get('/api/gps/hostels', (req, res) => {
    const hostels = queryAll('SELECT * FROM hostel_locations WHERE is_active = 1 ORDER BY gender, name');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hostels }));
  });

  // 3. CALCULATE ROUTE & FARE ESTIMATE
  // Supports Segment A (Partner -> Centre) + Segment B (Centre -> Hostel)
  router.post('/api/gps/estimate', (req, res) => {
    const {
      collectionCentreId,
      destinationHostelId,
      partnerLat,
      partnerLng,
      useFallback = false
    } = req.body || {};

    if (!collectionCentreId || !destinationHostelId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Collection centre and destination hostel must be specified.' }));
    }

    const centre = queryOne('SELECT * FROM campus_locations WHERE id = ?', [collectionCentreId]);
    const hostel = queryOne('SELECT * FROM hostel_locations WHERE id = ?', [destinationHostelId]);

    if (!centre || !hostel) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid collection centre or hostel location.' }));
    }

    if (useFallback) {
      const fare = calculateDeliveryFare(0, true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        centre: { name: centre.name, code: centre.code },
        hostel: { name: hostel.name, code: hostel.code },
        ...fare
      }));
    }

    // Segment B: Centre to Hostel
    const segmentBDistance = calculateRouteDistance(centre.latitude, centre.longitude, hostel.latitude, hostel.longitude);

    // Segment A: Partner to Centre (if partner GPS available, otherwise estimated average 0.3km)
    let segmentADistance = 0.3; // Default estimated partner walk to parcel centre
    if (typeof partnerLat === 'number' && typeof partnerLng === 'number') {
      segmentADistance = calculateRouteDistance(partnerLat, partnerLng, centre.latitude, centre.longitude);
    }

    const totalDistance = Math.round((segmentADistance + segmentBDistance) * 100) / 100;
    const fare = calculateDeliveryFare(totalDistance, false);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      centre: { name: centre.name, code: centre.code, lat: centre.latitude, lng: centre.longitude },
      hostel: { name: hostel.name, code: hostel.code, lat: hostel.latitude, lng: hostel.longitude },
      segmentADistance,
      segmentBDistance,
      ...fare
    }));
  });
}

module.exports = {
  calculateRouteDistance,
  calculateDeliveryFare,
  registerGpsRoutes
};
