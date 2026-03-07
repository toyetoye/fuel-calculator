const { pool, initDB } = require('./db');
require('dotenv').config();

// Rivers Class curves from the Interpolation Table
const RIVERS_LADEN = [[9.1,59.55],[9.2,60.3],[9.3,61.05],[9.4,61.8],[9.5,62.55],[9.6,63.3],[9.7,64.05],[9.8,64.8],[9.9,65.55],[10,66.3],[10.1,67.05],[10.2,67.8],[10.3,68.55],[10.4,69.3],[10.5,70.05],[10.6,70.8],[10.7,71.55],[10.8,72.3],[10.9,73.05],[11,73.8],[11.1,74.66],[11.2,75.52],[11.3,76.38],[11.4,77.24],[11.5,78.1],[11.6,78.96],[11.7,79.82],[11.8,80.68],[11.9,81.54],[12,82.4],[12.1,83.26],[12.2,84.12],[12.3,84.98],[12.4,85.84],[12.5,86.7],[12.6,87.56],[12.7,88.42],[12.8,89.28],[12.9,90.14],[13,91],[13.1,92.07],[13.2,93.14],[13.3,94.21],[13.4,95.28],[13.5,96.35],[13.6,97.42],[13.7,98.49],[13.8,99.56],[13.9,100.63],[14,101.7],[14.1,102.77],[14.2,103.84],[14.3,104.91],[14.4,105.98],[14.5,107.05],[14.6,108.12],[14.7,109.19],[14.8,110.26],[14.9,111.33],[15,112.4],[15.1,113.68],[15.2,114.96],[15.3,116.24],[15.4,117.52],[15.5,118.8],[15.6,120.08],[15.7,121.36],[15.8,122.64],[15.9,123.92],[16,125.2],[16.1,126.59],[16.2,127.98],[16.3,129.37],[16.4,130.76],[16.5,132.15],[16.6,133.54],[16.7,134.93],[16.8,136.32],[16.9,137.71],[17,139.1],[17.1,140.71],[17.2,142.32],[17.3,143.93],[17.4,145.54],[17.5,147.15],[17.6,148.76],[17.7,150.37],[17.8,151.98],[17.9,153.59],[18,155.2],[18.1,157.01],[18.2,158.82],[18.3,160.63],[18.4,162.44],[18.5,164.25],[18.6,166.06],[18.7,167.87],[18.8,169.68],[18.9,171.49],[19,173.3],[19.1,175.23],[19.2,177.16],[19.3,179.09],[19.4,181.02],[19.5,182.95],[19.6,184.88],[19.7,186.81],[19.8,188.74],[19.9,190.67],[20,192.6]];

const RIVERS_BALLAST = [[9.1,52.04],[9.2,52.68],[9.3,53.32],[9.4,53.96],[9.5,54.6],[9.6,55.24],[9.7,55.88],[9.8,56.52],[9.9,57.16],[10,57.8],[10.1,58.44],[10.2,59.08],[10.3,59.72],[10.4,60.36],[10.5,61],[10.6,61.64],[10.7,62.28],[10.8,62.92],[10.9,63.56],[11,64.2],[11.1,65.06],[11.2,65.92],[11.3,66.78],[11.4,67.64],[11.5,68.5],[11.6,69.36],[11.7,70.22],[11.8,71.08],[11.9,71.94],[12,72.8],[12.1,73.55],[12.2,74.3],[12.3,75.05],[12.4,75.8],[12.5,76.55],[12.6,77.3],[12.7,78.05],[12.8,78.8],[12.9,79.55],[13,80.3],[13.1,81.26],[13.2,82.22],[13.3,83.18],[13.4,84.14],[13.5,85.1],[13.6,86.06],[13.7,87.02],[13.8,87.98],[13.9,88.94],[14,89.9],[14.1,90.86],[14.2,91.82],[14.3,92.78],[14.4,93.74],[14.5,94.7],[14.6,95.66],[14.7,96.62],[14.8,97.58],[14.9,98.54],[15,99.5],[15.1,100.68],[15.2,101.86],[15.3,103.04],[15.4,104.22],[15.5,105.4],[15.6,106.58],[15.7,107.76],[15.8,108.94],[15.9,110.12],[16,111.3],[16.1,112.69],[16.2,114.08],[16.3,115.47],[16.4,116.86],[16.5,118.25],[16.6,119.64],[16.7,121.03],[16.8,122.42],[16.9,123.81],[17,125.2],[17.1,126.59],[17.2,127.98],[17.3,129.37],[17.4,130.76],[17.5,132.15],[17.6,133.54],[17.7,134.93],[17.8,136.32],[17.9,137.71],[18,139.1],[18.1,140.81],[18.2,142.52],[18.3,144.23],[18.4,145.94],[18.5,147.65],[18.6,149.36],[18.7,151.07],[18.8,152.78],[18.9,154.49],[19,156.2],[19.1,158.13],[19.2,160.06],[19.3,161.99],[19.4,163.92],[19.5,165.85],[19.6,167.78],[19.7,169.71],[19.8,171.64],[19.9,173.57],[20,175.5]];

// Rivers Plus Class curves
const RPLUS_LADEN = [[9.1,41.446],[9.2,42.612],[9.3,43.778],[9.4,44.944],[9.5,46.11],[9.6,47.276],[9.7,48.442],[9.8,49.608],[9.9,50.774],[10,51.94],[10.1,53.106],[10.2,54.272],[10.3,55.438],[10.4,56.604],[10.5,57.77],[10.6,58.936],[10.7,60.102],[10.8,61.268],[10.9,62.434],[11,63.6],[11.1,64.766],[11.2,65.932],[11.3,67.098],[11.4,68.264],[11.5,69.43],[11.6,70.596],[11.7,71.762],[11.8,72.928],[11.9,74.094],[12,75.26],[12.1,76.426],[12.2,77.592],[12.3,78.758],[12.4,79.924],[12.5,81.09],[12.6,82.256],[12.7,83.422],[12.8,84.588],[12.9,85.754],[13,86.92],[13.1,88.192],[13.2,89.464],[13.3,90.736],[13.4,92.008],[13.5,93.28],[13.6,94.552],[13.7,95.824],[13.8,97.096],[13.9,98.368],[14,99.64],[14.1,100.912],[14.2,102.184],[14.3,103.456],[14.4,104.728],[14.5,106],[14.6,107.272],[14.7,108.544],[14.8,109.816],[14.9,111.088],[15,112.36],[15.1,113.632],[15.2,114.904],[15.3,116.176],[15.4,117.448],[15.5,118.72],[15.6,119.992],[15.7,121.264],[15.8,122.536],[15.9,123.808],[16,125.08],[16.1,126.352],[16.2,127.624],[16.3,128.896]];

const RPLUS_BALLAST = []; // Not in the Excel - placeholder, can be seeded later

const VESSELS = [
  { name: 'LNG ADAMAWA', capacity: 141090, pitch: 7.8329, class: 'Rivers' },
  { name: 'LNG AKWA-IBOM', capacity: 141090, pitch: 7.8329, class: 'Rivers' },
  { name: 'LNG BAYELSA', capacity: 137100, pitch: 7.52, class: 'Rivers Plus' },
  { name: 'LNG CROSS-RIVER', capacity: 141090, pitch: 7.8329, class: 'Rivers' },
  { name: 'LNG RIVERS', capacity: 137100, pitch: 7.52, class: 'Rivers Plus' },
  { name: 'LNG RIVER-NIGER', capacity: 141090, pitch: 7.8329, class: 'Rivers' },
  { name: 'LNG SOKOTO', capacity: 137100, pitch: 7.52, class: 'Rivers Plus' },
];

const EXCLUSIONS = [
  { name: 'FORCE 1', excluded: false }, { name: 'FORCE 2', excluded: false },
  { name: 'FORCE 3', excluded: false }, { name: 'FORCE 4', excluded: false },
  { name: 'FORCE 5', excluded: false }, { name: 'FORCE 5 ^^^', excluded: true },
  { name: 'FORCE 6', excluded: true }, { name: 'FORCE 7', excluded: true },
  { name: 'FORCE 8', excluded: true }, { name: 'FORCE 9', excluded: true },
  { name: 'FORCE 10', excluded: true }, { name: 'PILOTAGE', excluded: true },
  { name: 'VISIBILITY <3', excluded: true }, { name: 'CONGESTED WATERS', excluded: true },
  { name: 'TO AVOID EXTREME BAD WEATHER', excluded: true },
  { name: 'BUNKERING', excluded: true }, { name: 'WAITING AREA', excluded: true },
  { name: 'OTHER CHARTERERS DEVIATION', excluded: true },
];

async function seed() {
  await initDB();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Vessels
    for (const v of VESSELS) {
      const boiloffLaden = v.class === 'Rivers Plus' ? 0.15 : 0.15;
      const boiloffBallast = v.class === 'Rivers Plus' ? 0.10 : 0.10;
      await c.query(`INSERT INTO lng_vessels (name, capacity_m3, pitch, vessel_class, foe_factor, laden_boiloff_pct, ballast_boiloff_pct) VALUES ($1,$2,$3,$4,0.484,$5,$6) ON CONFLICT (name) DO UPDATE SET capacity_m3=$2, pitch=$3, vessel_class=$4, laden_boiloff_pct=$5, ballast_boiloff_pct=$6`,
        [v.name, v.capacity, v.pitch, v.class, boiloffLaden, boiloffBallast]);
    }
    console.log(`${VESSELS.length} LNG vessels seeded`);

    // Curves
    await c.query('DELETE FROM interpolation_curves');
    const insertCurve = async (cls, leg, data) => {
      for (const [speed, fuel] of data) {
        await c.query('INSERT INTO interpolation_curves (vessel_class, leg_type, speed, fuel) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [cls, leg, speed, fuel]);
      }
    };
    await insertCurve('Rivers', 'LADEN', RIVERS_LADEN);
    await insertCurve('Rivers', 'BALLAST', RIVERS_BALLAST);
    await insertCurve('Rivers Plus', 'LADEN', RPLUS_LADEN);
    if (RPLUS_BALLAST.length) await insertCurve('Rivers Plus', 'BALLAST', RPLUS_BALLAST);
    console.log(`Interpolation curves seeded: Rivers(${RIVERS_LADEN.length}L+${RIVERS_BALLAST.length}B) RiversPlus(${RPLUS_LADEN.length}L)`);

    // Exclusions
    for (const e of EXCLUSIONS) {
      await c.query('INSERT INTO exclusion_items (name, excluded) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET excluded=$2', [e.name, e.excluded]);
    }
    console.log(`${EXCLUSIONS.length} exclusion items seeded`);

    await c.query('COMMIT');
    console.log('\nFuel calculator seed complete!');
  } catch (err) { await c.query('ROLLBACK'); console.error('Seed failed:', err); }
  finally { c.release(); await pool.end(); }
}

seed();
