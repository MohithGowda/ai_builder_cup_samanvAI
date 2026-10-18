import { useState, type KeyboardEvent } from 'react'
import { MapPin, Radio } from 'lucide-react'
import type { Overview } from './api'
import './governance-map.css'
import './governance-map-details.css'

const REGION_COORDINATES: Record<string, [number, number]> = {
  'Bengaluru South': [12.72, 77.58],
  Anekal: [12.70, 77.70],
  'Bengaluru North': [13.12, 77.62],
  Yelahanka: [13.10, 77.60],
  Mysuru: [12.30, 76.64],
  Nanjangud: [12.12, 76.68],
  Hunsur: [12.31, 76.29],
  Mandya: [12.52, 76.90],
  Maddur: [12.58, 77.04],
  Srirangapatna: [12.42, 76.70],
  Tumakuru: [13.34, 77.10],
  Gubbi: [13.32, 76.95],
  Tiptur: [13.26, 76.48],
  Ramanagara: [12.72, 77.28],
  Channapatna: [12.65, 77.21],
  Kanakapura: [12.55, 77.42],
}

const MARKER_OFFSETS: [number, number][] = [[0, 0], [-18, -13], [18, -13], [-18, 13], [18, 13]]
const REGION_INDEX_OFFSETS: Record<string, [number, number]> = {
  'Bengaluru North': [44, -34],
  'Bengaluru South': [52, 34],
  Ramanagara: [-40, -34],
  Mysuru: [-38, 36],
  Mandya: [0, 42],
  Tumakuru: [0, 38],
}
const MAP_WIDTH = 820
const MAP_HEIGHT = 370
const MAP_ZOOM = 8
const MAP_CENTER: [number, number] = [12.8, 76.9]

function worldPixels(latitude: number, longitude: number): [number, number] {
  const scale = 256 * 2 ** MAP_ZOOM
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const sine = Math.sin(clampedLatitude * Math.PI / 180)
  const x = (longitude + 180) / 360 * scale
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale
  return [x, y]
}

const centerPixels = worldPixels(...MAP_CENTER)
const mapOriginX = centerPixels[0] - MAP_WIDTH / 2
const mapOriginY = centerPixels[1] - MAP_HEIGHT / 2

function buildMapTiles() {
  const tiles: { x: number; y: number; left: number; top: number }[] = []
  const firstColumn = Math.floor(mapOriginX / 256)
  const lastColumn = Math.floor((mapOriginX + MAP_WIDTH) / 256)
  const firstRow = Math.floor(mapOriginY / 256)
  const lastRow = Math.floor((mapOriginY + MAP_HEIGHT) / 256)
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      tiles.push({ x: column, y: row, left: column * 256 - mapOriginX, top: row * 256 - mapOriginY })
    }
  }
  return tiles
}

const MAP_TILES = buildMapTiles()

function xFor(longitude: number) {
  return worldPixels(MAP_CENTER[0], longitude)[0] - mapOriginX
}

function yFor(latitude: number) {
  return worldPixels(latitude, MAP_CENTER[1])[1] - mapOriginY
}

export default function GovernanceMap({ data, department, drilldown }: { data: Overview; department: string; drilldown: (name: string) => void }) {
  const [selectedDepartment, setSelectedDepartment] = useState(department)
  const departments = data.department_summary.map(row => row.name)
  const visibleRows = data.territory_departments.filter(row => !selectedDepartment || row.department === selectedDepartment)
  const visibleDepartments = departments.filter(name => !selectedDepartment || name === selectedDepartment)
  const totalRequests = visibleRows.reduce((sum, row) => sum + row.total, 0)
  const activeRequests = visibleRows.reduce((sum, row) => sum + row.active, 0)
  const overdueRequests = visibleRows.reduce((sum, row) => sum + row.overdue, 0)
  const unmappedRequests = visibleRows.filter(row => !REGION_COORDINATES[row.territory]).reduce((sum, row) => sum + row.total, 0)
  const updateTime = new Date(data.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  function activateRegion(event: KeyboardEvent<SVGGElement>, region: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      drilldown(region)
    }
  }

  return <section className="review-geo-map" aria-labelledby="geo-map-title">
    <div className="geo-map-heading">
      <div>
        <span className="review-kicker">REGIONAL SERVICE PULSE</span>
        <h3 id="geo-map-title">Department requests by region</h3>
        <p>Dot value is active requests; dot size reflects total received.</p>
      </div>
      <div className="geo-map-actions">
        <span className="geo-map-updated"><Radio size={14} />Updated {updateTime} · 15 sec refresh</span>
        <label>Department<select aria-label="Map department filter" value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)}>
          <option value="">All departments</option>
          {departments.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
      </div>
    </div>
    <div className="geo-map-summary" aria-live="polite">
      <span><strong>{activeRequests.toLocaleString('en-IN')}</strong> active</span>
      <span><strong>{totalRequests.toLocaleString('en-IN')}</strong> total requests</span>
      <span><strong>{overdueRequests.toLocaleString('en-IN')}</strong> overdue</span>
    </div>
    <div className="geo-map-viewport" role="region" aria-label="Scrollable regional request map" tabIndex={0}>
      <svg className="geo-map-svg" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label={`Department counts across ${data.territories.length} ${data.territory_level} regions`}>
        <rect className="geo-map-background" x="0" y="0" width="820" height="370" />
        {MAP_TILES.map(tile => <image className="geo-map-tile" key={`${tile.x}-${tile.y}`} href={`https://tile.openstreetmap.org/${MAP_ZOOM}/${tile.x}/${tile.y}.png`} x={tile.left} y={tile.top} width="256" height="256" preserveAspectRatio="none" />)}
        {[12, 12.5, 13, 13.5].map(latitude => <g key={`lat-${latitude}`}>
          <line className="geo-map-gridline" x1="64" x2="754" y1={yFor(latitude)} y2={yFor(latitude)} />
          <text className="geo-map-coordinate" x="8" y={yFor(latitude) + 4}>{latitude.toFixed(1)}°N</text>
        </g>)}
        {[76, 76.5, 77, 77.5].map(longitude => <g key={`lon-${longitude}`}>
          <line className="geo-map-gridline" x1={xFor(longitude)} x2={xFor(longitude)} y1="48" y2="324" />
          <text className="geo-map-coordinate" x={xFor(longitude)} y="352" textAnchor="middle">{longitude.toFixed(1)}°E</text>
        </g>)}
        {data.territories.map((region, regionIndex) => {
          const coordinate = REGION_COORDINATES[region.name]
          if (!coordinate) return null
          const [latitude, longitude] = coordinate
          const centerX = xFor(longitude)
          const centerY = yFor(latitude)
          const [indexOffsetX, indexOffsetY] = REGION_INDEX_OFFSETS[region.name] || [38, -34]
          const regionRows = visibleRows.filter(row => row.territory === region.name)
          const regionActive = regionRows.reduce((sum, row) => sum + row.active, 0)
          const regionTotal = regionRows.reduce((sum, row) => sum + row.total, 0)
          return <g key={region.name}>
            <circle className="geo-region-halo" cx={centerX} cy={centerY} r="29" />
            {regionRows.map(row => {
              const departmentIndex = departments.indexOf(row.department)
              const [offsetX, offsetY] = selectedDepartment ? [0, 0] : MARKER_OFFSETS[departmentIndex % MARKER_OFFSETS.length]
              const markerRadius = Math.min(17, 9 + Math.sqrt(row.total) * 0.35)
              const label = `${region.name}, ${row.department}: ${row.active} active of ${row.total} requests, ${row.overdue} overdue. Select to filter this region.`
              return <g key={`${region.name}-${row.department}`} className="geo-map-point" role="button" tabIndex={0} aria-label={label} onClick={() => drilldown(region.name)} onKeyDown={event => activateRegion(event, region.name)}>
                <title>{label}</title>
                <circle className="geo-map-point-halo" cx={centerX + offsetX} cy={centerY + offsetY} r={markerRadius + 4} />
                <circle cx={centerX + offsetX} cy={centerY + offsetY} r={markerRadius} />
                <text x={centerX + offsetX} y={centerY + offsetY + 3.5}>{row.active}</text>
              </g>
            })}
            <g className="geo-region-index" role="button" tabIndex={0} aria-label={`Select ${region.name}: ${regionActive} active of ${regionTotal} requests`} onClick={() => drilldown(region.name)} onKeyDown={event => activateRegion(event, region.name)}>
              <title>{`Select ${region.name}: ${regionActive} active of ${regionTotal} requests`}</title>
              <circle cx={centerX + indexOffsetX} cy={centerY + indexOffsetY} r="13" />
              <text x={centerX + indexOffsetX} y={centerY + indexOffsetY + 4}>{regionIndex + 1}</text>
            </g>
          </g>
        })}
      </svg>
    </div>
    <div className="geo-map-region-list" role="group" aria-label="Select a region to drill down">
      {data.territories.map((region, index) => {
        const rows = visibleRows.filter(row => row.territory === region.name)
        const total = rows.reduce((sum, row) => sum + row.total, 0)
        const active = rows.reduce((sum, row) => sum + row.active, 0)
        return <button type="button" className="geo-map-region-item" key={region.name} onClick={() => drilldown(region.name)} aria-label={`Review ${region.name}: ${active} active, ${total} total requests`}>
          <span className="geo-map-region-number">{index + 1}</span><span className="geo-map-region-name">{region.name}</span><span>{total} received</span><strong>{active} active</strong>
        </button>
      })}
    </div>
    <div className="geo-map-legend" aria-label="Map department legend">
      {visibleDepartments.map(name => {
        const rows = visibleRows.filter(row => row.department === name)
        const active = rows.reduce((sum, row) => sum + row.active, 0)
        return <span key={name}><i />{name}<strong>{active} active</strong></span>
      })}
    </div>
    <p className="geo-map-note"><MapPin size={14} /><span>Illustrative district/taluk center coordinates only. Department dots are offset to avoid overlap; they are not office or case locations. Counts use the authorized scope and refresh with the overview snapshot. Map tiles © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.{unmappedRequests ? ` ${unmappedRequests} requests have no mapped region.` : ''}</span></p>
  </section>
}