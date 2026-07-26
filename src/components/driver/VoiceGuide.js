'use client'

import { useImperativeHandle, forwardRef, useRef, useEffect } from 'react'

/**
 * VoiceGuide — speaks navigation instructions via Web Speech API, and can
 * play a short attention chime via the Web Audio API (no audio asset file —
 * synthesized the same way speak() has no dependency on an external asset).
 *
 * Mobile browsers block speechSynthesis AND audio playback until a user
 * gesture has occurred. Call unlock() from any click/tap handler to prime
 * both APIs, after which speak()/chime() work freely — including from
 * GPS/timer/Pusher callbacks.
 *
 * Exposed methods (via ref):
 *   unlock()          — call once from a user tap to unblock speech/audio on mobile
 *   chime()            — play a short two-tone alert sound (e.g. before a merge announcement)
 *   speak(text)       — speak a string; deduplicates consecutive identical strings
 *   speakStep(step)   — speak a normalized Directions step object (maneuver + distance)
 */
const VoiceGuide = forwardRef(function VoiceGuide(_, ref) {
  const lastSpoken   = useRef(null)
  const unlockedRef  = useRef(false)
  const audioCtxRef  = useRef(null)

  // Chrome Android bug: speechSynthesis pauses after ~15s in background.
  // Keep it alive by resuming on visibilitychange.
  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useImperativeHandle(ref, () => ({
    unlock() {
      if (unlockedRef.current) return
      if (typeof window === 'undefined') return
      unlockedRef.current = true
      // Speak a silent utterance to unlock the Speech Synthesis API
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(' ')
        u.volume = 0
        window.speechSynthesis.speak(u)
      }
      // Create (and resume) the AudioContext on this same user gesture —
      // browsers start it 'suspended' until a gesture unlocks it, same
      // restriction as speechSynthesis above.
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (Ctor && !audioCtxRef.current) {
        audioCtxRef.current = new Ctor()
      }
      audioCtxRef.current?.resume?.()
    },

    // Short two-tone attention chime (no audio file — synthesized via Web
    // Audio API, same "no external asset" approach as speak() below).
    // Intended to precede a spoken announcement so the driver notices the
    // phone before the voice line starts, e.g. on a mid-route merge notice.
    chime() {
      const ctx = audioCtxRef.current
      if (!ctx) return // not unlocked yet — silently skip, never throws
      const now = ctx.currentTime
      const notes = [880, 1175] // A5 then D6 — a short, distinct two-note alert
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const start = now + i * 0.16
        const end   = start + 0.14
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.35, start + 0.02)
        gain.gain.linearRampToValueAtTime(0, end)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(end)
      })
    },

    speak(text) {
      if (!text || text === lastSpoken.current) return
      if (typeof window === 'undefined' || !window.speechSynthesis) return
      lastSpoken.current = text
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang   = 'en-US'
      u.rate   = 1.05
      u.volume = 1.0
      window.speechSynthesis.speak(u)
    },

    // stage: 'farOut' | 'early' | 'main' | 'final'
    // distM: live metres to the turn (from GPS, not step.distance)
    speakStep(step, distM, stage) {
      if (!step) return
      const instruction = step.maneuver?.instruction
      if (!instruction) return

      let text
      if (stage === 'final') {
        // "Turn right now"
        text = `${instruction} now`
      } else if (stage === 'main') {
        // "Turn right"
        text = instruction
      } else if (stage === 'farOut') {
        // Long-range highway advisory (~2km out) — distinct phrasing from
        // 'early' ("in 500m, turn right") so the driver hears this as a
        // heads-up to get in the right lane, not the actual turn cue.
        const d = distM ?? step.distance
        const distText = d >= 1000 ? `${(d / 1000).toFixed(1)} kilometres` : `${Math.round(d / 10) * 10} metres`
        text = `In ${distText}, ${instruction}. Please get into the correct lane.`
      } else {
        // 'early' — "In 500 metres, turn right onto Main Street"
        const d = distM ?? step.distance
        let distText = ''
        if (d >= 1000) distText = `In ${(d / 1000).toFixed(1)} kilometres, `
        else if (d >= 50) distText = `In ${Math.round(d / 10) * 10} metres, `
        text = `${distText}${instruction}`
      }
      this.speak(text)
    },
  }))

  return null
})

export default VoiceGuide
