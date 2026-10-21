import { useMemo, useRef, useState } from 'react';
import { createGeographicTerrain, MAX_IMAGERY_BYTES, parseAsciiGrid, validateTerrainImagery } from '../domain/geography';
import type { AsciiGrid, GeographicBounds, GeographicSource, TerrainImagery } from '../domain/geography';

type Crop = ReturnType<typeof createGeographicTerrain>;
const osSource: GeographicSource = { sourceName: '', license: 'Open Government Licence v3.0', attribution: 'Contains OS data © Crown copyright and database right.', verticalDatum: 'Ordnance Datum Newlyn (metres)' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The selected source could not be read.';
function Field({ label, value, onChange, number = false }: { label: string; value: string | number; onChange: (value: string) => void; number?: boolean }) {
  return <label>{label}<input aria-label={label} type={number ? 'number' : 'text'} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function GeoPanel({ getGeneration, onApply }: { getGeneration: () => number; onApply: (crop: Crop & { terrainImagery?: TerrainImagery }, generation: number) => boolean }) {
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const [source, setSource] = useState(osSource);
  const [easting, setEasting] = useState(0), [northing, setNorthing] = useState(0), [radius, setRadius] = useState(128), [resolution, setResolution] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ dataUrl: string; width: number; height: number; name: string } | null>(null);
  const [imageSource, setImageSource] = useState({ sourceName: '', license: '', attribution: '' });
  const [imageBounds, setImageBounds] = useState<GeographicBounds>({ west: 0, south: 0, east: 0, north: 0 });
  const [permission, setPermission] = useState(false);
  const sourceGeneration = useRef<number | null>(null), imageGeneration = useRef<number | null>(null), readOperation = useRef(0);
  const selectedBounds = { west: easting - radius, east: easting + radius, south: northing - radius, north: northing + radius };
  const outputResolution = resolution || (grid ? Math.min(257, Math.max(9, Math.ceil(radius * 2 / grid.cellSize / 2) * 2 + 1)) : 0);
  const preview = useMemo(() => {
    if (!grid) return null;
    let minimum = Infinity, maximum = -Infinity;
    for (const value of grid.values) if (value !== grid.nodata) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
    const cells: { x: number; y: number; width: number; height: number; shade: number }[] = [];
    const stepX = Math.max(1, Math.ceil(grid.ncols / 48)), stepY = Math.max(1, Math.ceil(grid.nrows / 48));
    for (let y = 0; y < grid.nrows; y += stepY) for (let x = 0; x < grid.ncols; x += stepX) {
      const value = grid.values[y * grid.ncols + x]!;
      cells.push({ x, y, width: stepX, height: stepY, shade: value === grid.nodata ? -1 : Math.round(28 + 48 * (value - minimum) / (maximum - minimum || 1)) });
    }
    return { minimum, maximum, cells };
  }, [grid]);
  const current = (generation: number, operation: number) => generation === getGeneration() && operation === readOperation.current;
  async function loadGrid(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.asc') || file.size > 64 * 1024 * 1024) { setStatus('Choose an extracted .asc grid up to 64 MiB. ZIP archives are not read here.'); return; }
    const generation = getGeneration(), operation = ++readOperation.current;
    setBusy(true); setStatus('Reading source samples…');
    try {
      const parsed = parseAsciiGrid(await file.text());
      if (!current(generation, operation)) return;
      sourceGeneration.current = generation;
      setGrid(parsed); setSource({ ...osSource, sourceName: file.name }); setImage(null);
      const halfWidth = (parsed.ncols - 1) * parsed.cellSize / 2, halfDepth = (parsed.nrows - 1) * parsed.cellSize / 2;
      setEasting(parsed.xOrigin + halfWidth); setNorthing(parsed.yOrigin + halfDepth);
      setRadius(Math.max(8, Math.min(1024, Math.floor(Math.min(halfWidth, halfDepth) * 0.8))));
      setStatus('Source loaded. Click its map or enter the centre and radius. Check the supplied licence and datum.');
    } catch (error) { if (current(generation, operation)) setStatus(errorText(error)); }
    finally { if (operation === readOperation.current) setBusy(false); }
  }
  async function loadImage(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_IMAGERY_BYTES) { setStatus('Choose a PNG or JPEG up to 15 MiB.'); return; }
    const generation = getGeneration(), operation = ++readOperation.current;
    setBusy(true); setStatus('Decoding image…');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Image file could not be read.')); reader.readAsDataURL(file); });
      const decoded = new Image(); decoded.src = dataUrl; await decoded.decode();
      if (decoded.width > 8192 || decoded.height > 8192 || decoded.width * decoded.height > 32_000_000) throw new Error('Image exceeds the 8192 pixel side or 32 megapixel budget.');
      if (!current(generation, operation)) return;
      imageGeneration.current = generation; setImage({ dataUrl, width: decoded.width, height: decoded.height, name: file.name });
      setImageSource({ sourceName: file.name, license: '', attribution: '' }); setPermission(false); setStatus('Image decoded. Enter its actual British National Grid bounds and licence.');
    } catch (error) { if (current(generation, operation)) setStatus(errorText(error)); }
    finally { if (operation === readOperation.current) setBusy(false); }
  }
  function apply() {
    if (!grid) return;
    const generation = getGeneration();
    if (generation !== sourceGeneration.current || (image && generation !== imageGeneration.current)) { setStatus('The world changed. Load the source again before applying.'); return; }
    try {
      const crop = createGeographicTerrain(grid, { easting, northing, radius, ...(resolution ? { resolution } : {}) }, source);
      let terrainImagery: TerrainImagery | undefined;
      if (image) {
        if (!permission) throw new Error('Confirm that you may use the image under the licence you entered.');
        terrainImagery = { crs: 'EPSG:27700', dataUrl: image.dataUrl, bounds: imageBounds, ...imageSource };
        const errors = validateTerrainImagery(terrainImagery, crop.geography);
        if (errors.length) throw new Error(errors[0]);
      }
      if (onApply({ ...crop, terrainImagery }, generation)) setStatus('Geographic terrain applied as one Undo step.');
      else setStatus('The world changed or the project limit was exceeded. Load the source again.');
    } catch (error) { setStatus(errorText(error)); }
  }
  return <div className="geo-panel">
    <div className="panel-heading"><div><span className="eyebrow">BRITISH NATIONAL GRID</span><h2>Geographic terrain</h2></div></div>
    <p className="library-note">Load an OS ASCII elevation grid, choose an area, then optionally drape imagery that you are licensed to use. Coordinates stay in EPSG:27700; east is +X and north is −Z.</p>
    <label className="import-card"><b>Load elevation .asc</b><small>Extract the plain ASCII grid from its download</small><input aria-label="Elevation ASCII grid" type="file" accept=".asc,text/plain" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void loadGrid(file); }} /></label>
    {grid && preview && <>
      <svg className="geo-source-preview" aria-label="Loaded elevation source and selected crop" role="img" viewBox={`0 0 ${grid.ncols - 1} ${grid.nrows - 1}`} onClick={(event) => { const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return; const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); setEasting(Math.round(grid.xOrigin + point.x * grid.cellSize)); setNorthing(Math.round(grid.yOrigin + (grid.nrows - 1 - point.y) * grid.cellSize)); }}>
        {preview.cells.map((cell, i) => <rect key={i} x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill={cell.shade < 0 ? '#814f76' : `hsl(99 16% ${cell.shade}%)`} />)}
        <rect x={(selectedBounds.west - grid.xOrigin) / grid.cellSize} y={(grid.yOrigin + (grid.nrows - 1) * grid.cellSize - selectedBounds.north) / grid.cellSize} width={radius * 2 / grid.cellSize} height={radius * 2 / grid.cellSize} fill="#e3ca6c22" stroke="#f5d677" strokeWidth={(grid.ncols - 1) / 150} />
        <circle cx={(easting - grid.xOrigin) / grid.cellSize} cy={(grid.yOrigin + (grid.nrows - 1) * grid.cellSize - northing) / grid.cellSize} r={radius / grid.cellSize} fill="none" stroke="#fff2b0" strokeDasharray={`${(grid.ncols - 1) / 40}`} strokeWidth={(grid.ncols - 1) / 200} />
      </svg>
      <p className="library-note">Loaded samples: {grid.ncols} × {grid.nrows}. Height range {Number.isFinite(preview.minimum) ? preview.minimum.toFixed(1) : 'NODATA'}–{Number.isFinite(preview.maximum) ? preview.maximum.toFixed(1) : 'NODATA'} m. Shading comes from this file. The square is the terrain crop; the circle shows your radius.</p>
      <div className="two-fields"><Field label="Centre easting" value={easting} number onChange={(value) => setEasting(Number(value))} /><Field label="Centre northing" value={northing} number onChange={(value) => setNorthing(Number(value))} /></div>
      <Field label="Area radius (m)" value={radius} number onChange={(value) => setRadius(Number(value))} />
      <label>Output grid<select aria-label="Geographic output grid" value={resolution} onChange={(event) => setResolution(Number(event.target.value))}><option value={0}>Automatic</option>{[33, 65, 129, 257].map((size) => <option key={size} value={size}>{size} × {size}</option>)}</select></label>
      <p className="geo-resolution">Source spacing: <b>{grid.cellSize} m</b><br />Output spacing: <b>{outputResolution > 1 ? (radius * 2 / (outputResolution - 1)).toFixed(2) : '—'} m</b> · {outputResolution} × {outputResolution}<br />Interpolation adds no source detail. Maximum crop: 2048 × 2048 m.</p>
      {(['sourceName', 'license', 'attribution', 'verticalDatum'] as const).map((key) => <Field key={key} label={{ sourceName: 'Elevation source name', license: 'Elevation licence', attribution: 'Elevation attribution', verticalDatum: 'Vertical datum' }[key]} value={source[key]} onChange={(value) => setSource({ ...source, [key]: value })} />)}
      <div className="section-divider" /><h3>Licensed imagery</h3>
      <label className="import-card"><b>Load PNG / JPEG</b><small>Provide licence, attribution and actual bounds</small><input aria-label="Licensed terrain imagery" type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void loadImage(file); }} /></label>
      {image && <><img className="geo-image-preview" src={image.dataUrl} alt={`Loaded imagery: ${image.name}`} /><p className="library-note">Decoded {image.width} × {image.height} pixels. Enter the image's actual extent; it is not assumed to match the selected crop.</p>
        <div className="two-fields">{(['west', 'south', 'east', 'north'] as const).map((key) => <Field key={key} label={`Image ${key}`} value={imageBounds[key]} number onChange={(value) => setImageBounds({ ...imageBounds, [key]: Number(value) })} />)}</div>
        <button className="reset-material-button" onClick={() => setImageBounds(selectedBounds)}>Image matches selected bounds</button>
        {(['sourceName', 'license', 'attribution'] as const).map((key) => <Field key={key} label={{ sourceName: 'Image source name', license: 'Image licence', attribution: 'Image attribution' }[key]} value={imageSource[key]} onChange={(value) => setImageSource({ ...imageSource, [key]: value })} />)}
        <label className="geo-permission"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} /> I may use this image under the licence above.</label><button className="reset-material-button" onClick={() => setImage(null)}>Remove pending imagery</button>
      </>}
      <p className="feature-warning">Applying replaces the terrain and updates spawn height. Existing objects and drawn features retain their exact positions; their grounding may need adjustment. Elevations keep the supplied datum.</p>
      <button className="geo-apply" disabled={busy} onClick={apply}>Apply geographic terrain</button>
    </>}
    {status && <p role="status" className="geo-status">{status}</p>}
  </div>;
}
