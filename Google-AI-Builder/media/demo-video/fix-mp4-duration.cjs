const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, 'samanvai-overview.mp4');
const output = path.join(__dirname, 'samanvai-overview-candidate.mp4');
const data = fs.readFileSync(source);

function boxes(start, end) {
  const result = [];
  for (let position = start; position + 8 <= end;) {
    let size = data.readUInt32BE(position);
    const type = data.toString('ascii', position + 4, position + 8);
    let headerSize = 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(position + 8));
      headerSize = 16;
    }
    if (size === 0) size = end - position;
    if (size < headerSize || position + size > end) break;
    result.push({ position, size, type, content: position + headerSize });
    position += size;
  }
  return result;
}

function child(parent, type) {
  return boxes(parent.content, parent.position + parent.size).find(box => box.type === type);
}

function fullBoxFlags(box) {
  return data[box.content + 1] * 65536 + data[box.content + 2] * 256 + data[box.content + 3];
}

function readVersionedDuration(box, version0Offset, version1Offset) {
  return data[box.content] === 1
    ? Number(data.readBigUInt64BE(box.content + version1Offset))
    : data.readUInt32BE(box.content + version0Offset);
}

function writeVersionedDuration(box, duration, version0Offset, version1Offset) {
  if (data[box.content] === 1) data.writeBigUInt64BE(BigInt(duration), box.content + version1Offset);
  else {
    if (duration > 0xffffffff) throw new Error(`Duration exceeds version-0 field in ${box.type}`);
    data.writeUInt32BE(duration, box.content + version0Offset);
  }
}

const top = boxes(0, data.length);
const moov = top.find(box => box.type === 'moov');
if (!moov) throw new Error('MP4 moov box is missing');
const movieHeader = child(moov, 'mvhd');
const movieScale = data.readUInt32BE(movieHeader.content + (data[movieHeader.content] === 1 ? 20 : 12));
const tracks = new Map();

for (const track of boxes(moov.content, moov.position + moov.size).filter(box => box.type === 'trak')) {
  const trackHeader = child(track, 'tkhd');
  const media = child(track, 'mdia');
  const mediaHeader = child(media, 'mdhd');
  const handler = child(media, 'hdlr');
  const trackHeaderVersion = data[trackHeader.content];
  const trackId = data.readUInt32BE(trackHeader.content + (trackHeaderVersion === 1 ? 20 : 12));
  const mediaVersion = data[mediaHeader.content];
  const mediaScale = data.readUInt32BE(mediaHeader.content + (mediaVersion === 1 ? 20 : 12));
  tracks.set(trackId, {
    id: trackId,
    type: data.toString('ascii', handler.content + 8, handler.content + 12),
    trackHeader,
    mediaHeader,
    mediaScale,
    mediaEnd: 0,
    samples: 0,
    fragments: 0,
  });
}

for (const moof of top.filter(box => box.type === 'moof')) {
  for (const traf of boxes(moof.content, moof.position + moof.size).filter(box => box.type === 'traf')) {
    const tfhd = child(traf, 'tfhd');
    const tfdt = child(traf, 'tfdt');
    const trackId = data.readUInt32BE(tfhd.content + 4);
    const track = tracks.get(trackId);
    if (!track) continue;
    const flags = fullBoxFlags(tfhd);
    let tfhdPosition = tfhd.content + 8;
    if (flags & 0x000001) tfhdPosition += 8;
    if (flags & 0x000002) tfhdPosition += 4;
    let defaultDuration = 0;
    if (flags & 0x000008) {
      defaultDuration = data.readUInt32BE(tfhdPosition);
      tfhdPosition += 4;
    }
    if (flags & 0x000010) tfhdPosition += 4;
    if (flags & 0x000020) tfhdPosition += 4;

    const tfdtVersion = data[tfdt.content];
    const baseTime = tfdtVersion === 1
      ? Number(data.readBigUInt64BE(tfdt.content + 4))
      : data.readUInt32BE(tfdt.content + 4);

    const trun = child(traf, 'trun');
    const runFlags = fullBoxFlags(trun);
    const sampleCount = data.readUInt32BE(trun.content + 4);
    let runPosition = trun.content + 8;
    if (runFlags & 0x000001) runPosition += 4;
    if (runFlags & 0x000004) runPosition += 4;
    let duration = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      let sampleDuration = defaultDuration;
      if (runFlags & 0x000100) {
        sampleDuration = data.readUInt32BE(runPosition);
        runPosition += 4;
      }
      if (runFlags & 0x000200) runPosition += 4;
      if (runFlags & 0x000400) runPosition += 4;
      if (runFlags & 0x000800) runPosition += 4;
      duration += sampleDuration;
    }
    track.mediaEnd = Math.max(track.mediaEnd, baseTime + duration);
    track.samples += sampleCount;
    track.fragments += 1;
  }
}

let movieDuration = 0;
for (const track of tracks.values()) {
  if (!track.mediaEnd || !track.mediaScale) throw new Error(`No usable fragment timeline for track ${track.id}`);
  const trackMovieDuration = Math.ceil(track.mediaEnd * movieScale / track.mediaScale);
  movieDuration = Math.max(movieDuration, trackMovieDuration);
  const mediaVersion = data[track.mediaHeader.content];
  writeVersionedDuration(track.mediaHeader, track.mediaEnd, 16, 24);
  writeVersionedDuration(track.trackHeader, trackMovieDuration, 20, 28);
  console.log(`${track.type}: ${track.samples} samples, ${track.fragments} fragments, ${(track.mediaEnd / track.mediaScale).toFixed(2)} seconds`);
}

writeVersionedDuration(movieHeader, movieDuration, 16, 24);
for (const mvex of boxes(moov.content, moov.position + moov.size).filter(box => box.type === 'mvex')) {
  const mehd = child(mvex, 'mehd');
  if (mehd) writeVersionedDuration(mehd, movieDuration, 4, 4);
}
fs.writeFileSync(output, data);
console.log(`Wrote ${path.basename(output)}: ${(movieDuration / movieScale).toFixed(2)} seconds at movie timescale ${movieScale}`);