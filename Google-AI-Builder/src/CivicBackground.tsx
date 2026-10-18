import { useEffect, useRef } from 'react'
import './civic-background.css'

const routes = [
  [[0.03, 0.21], [0.15, 0.21], [0.24, 0.09], [0.46, 0.09], [0.56, 0.21], [0.77, 0.21], [0.89, 0.07], [1.03, 0.07]],
  [[0.39, -0.03], [0.39, 0.15], [0.52, 0.32], [0.74, 0.32], [0.84, 0.45], [1.03, 0.45]],
  [[1.03, 0.66], [0.88, 0.66], [0.79, 0.78], [0.62, 0.78], [0.49, 0.95], [0.24, 0.95]],
  [[0.03, 0.63], [0.15, 0.63], [0.23, 0.74], [0.37, 0.74], [0.49, 0.9], [0.7, 0.9]],
  [[0.93, -0.03], [0.93, 0.22], [0.84, 0.34], [0.84, 0.53], [0.94, 0.66], [0.94, 1.04]],
] as const

const hubs = [[0.24, 0.09], [0.56, 0.21], [0.74, 0.32], [0.88, 0.66], [0.37, 0.74], [0.62, 0.78]] as const

export default function CivicBackground({ paused, citizen }: { paused: boolean; citizen: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let networkColor = ''
    let width = 0
    let height = 0
    let animationFrame = 0
    let lastFrame = 0
    let elapsed = 0

    function draw() {
      if (!context) return
      context.clearRect(0, 0, width, height)
      context.lineWidth = 1
      context.strokeStyle = `rgba(${networkColor}, 0.045)`
      const spacing = width < 600 ? 68 : 96
      for (let position = 28; position < width; position += spacing) {
        context.beginPath()
        context.moveTo(position, 0)
        context.lineTo(position, height)
        context.stroke()
      }
      for (let position = 16; position < height; position += spacing) {
        context.beginPath()
        context.moveTo(0, position)
        context.lineTo(width, position)
        context.stroke()
      }

      for (const [routeIndex, route] of routes.entries()) {
        const points = route.map(([positionX, positionY]) => ({ x: positionX * width, y: positionY * height }))
        context.beginPath()
        points.forEach((point, index) => { if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y) })
        context.strokeStyle = `rgba(${networkColor}, ${routeIndex % 2 ? 0.12 : 0.18})`
        context.lineWidth = routeIndex % 2 ? 1 : 1.3
        context.stroke()

        const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
        const totalLength = lengths.reduce((total, length) => total + length, 0)
        const packetCount = width < 600 ? 1 : 2
        for (let packet = 0; packet < packetCount; packet += 1) {
          let distance = ((elapsed * (11 + routeIndex * 2) + routeIndex * 101 + packet * totalLength / 2) % totalLength)
          for (let index = 0; index < lengths.length; index += 1) {
            if (distance > lengths[index]) { distance -= lengths[index]; continue }
            const progress = lengths[index] ? distance / lengths[index] : 0
            const start = points[index]
            const end = points[index + 1]
            const positionX = start.x + (end.x - start.x) * progress
            const positionY = start.y + (end.y - start.y) * progress
            context.save()
            context.translate(positionX, positionY)
            context.rotate(Math.atan2(end.y - start.y, end.x - start.x))
            context.fillStyle = `rgba(${networkColor}, 0.6)`
            context.fillRect(-5, -1.25, 10, 2.5)
            context.restore()
            break
          }
        }
      }

      for (const [index, [positionX, positionY]] of hubs.entries()) {
        const centerX = positionX * width
        const centerY = positionY * height
        const pulse = 0.16 + (Math.sin(elapsed * 0.65 + index) + 1) * 0.07
        context.strokeStyle = `rgba(${networkColor}, ${pulse})`
        context.lineWidth = 1
        context.strokeRect(centerX - 9, centerY - 9, 18, 18)
        context.fillStyle = `rgba(${networkColor}, 0.22)`
        context.fillRect(centerX - 2, centerY - 2, 4, 4)
      }
    }

    function animate(timestamp: number) {
      if (lastFrame === 0 || timestamp - lastFrame >= 1000 / 24) {
        if (lastFrame) elapsed += Math.min(0.1, (timestamp - lastFrame) / 1000)
        lastFrame = timestamp
        draw()
      }
      animationFrame = requestAnimationFrame(animate)
    }

    function updateMotion() {
      cancelAnimationFrame(animationFrame)
      lastFrame = 0
      networkColor = getComputedStyle(document.documentElement).getPropertyValue(citizen ? '--network-citizen' : '--network-government').trim() || '49, 174, 188'
      draw()
      if (!paused && !motionPreference.matches && !document.hidden && width > 0 && height > 0) {
        animationFrame = requestAnimationFrame(animate)
      }
      canvas?.setAttribute('data-motion', paused || motionPreference.matches || document.hidden ? 'paused' : 'playing')
    }

    const observer = new ResizeObserver(entries => {
      const bounds = entries[0].contentRect
      width = bounds.width
      height = bounds.height
      const scale = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
      updateMotion()
    })
    observer.observe(canvas)
    motionPreference.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateMotion)
    document.addEventListener('samanvai-theme-change', updateMotion)
    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      motionPreference.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateMotion)
      document.removeEventListener('samanvai-theme-change', updateMotion)
    }
  }, [paused, citizen])

  return <div className="civic-background" aria-hidden="true"><canvas ref={canvasRef} /></div>
}