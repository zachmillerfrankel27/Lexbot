'use client'

import { useState } from 'react'

type Mode = 'discussion' | 'socratic' | 'examprep'

export interface SessionEntry {
  id: string
  date: string
  mode: Mode
  durationSeconds: number
  examTopic?: string
}

const YEAR_OPTIONS = ['1L', '2L', '3L', 'LLM', 'Other'] as const

const MODE_LABELS: Record<Mode, string> = {
  discussion: 'Discussion',
  socratic: 'Socratic',
  examprep: 'Exam Prep',
}

interface ProfileModalProps {
  onClose: () => void
  userName: string
  userYear: string
  userCourses: string[]
  sessions: SessionEntry[]
  onSave: (data: { name: string; year: string; courses: string[] }) => void
}

export function ProfileModal({ onClose, userName, userYear, userCourses, sessions, onSave }: ProfileModalProps) {
  const [tab, setTab] = useState<'profile' | 'history'>('profile')
  const [name, setName] = useState(userName)
  const [year, setYear] = useState(userYear)
  const [courses, setCourses] = useState<string[]>(userCourses)
  const [courseInput, setCourseInput] = useState('')

  function addCourse() {
    const c = courseInput.trim()
    if (!c) return
    const formatted = c
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    if (courses.includes(formatted)) return
    setCourses(prev => [...prev, formatted])
    setCourseInput('')
  }

  function removeCourse(course: string) {
    setCourses(prev => prev.filter(c => c !== course))
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    if (m === 0) return `${s}s`
    if (s === 0) return `${m}m`
    return `${m}m ${s}s`
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return iso }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto px-4"
      style={{ background: 'rgba(0,0,0,0.90)' }}
    >
      <div
        className="flex flex-col w-full max-w-md rounded-xl overflow-hidden"
        style={{ background: '#080810', border: '1px solid #1a1a2e', maxHeight: '82vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1a1a2e' }}>
          <h2 className="font-sans text-[10px] uppercase tracking-[0.3em] text-gray-500">
            {userName ? `${userName}'s Profile` : 'Profile'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-700 hover:text-gray-400 text-xs uppercase tracking-widest transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid #1a1a2e' }}>
          {(['profile', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 font-sans text-[10px] uppercase tracking-[0.25em] transition-colors"
              style={
                tab === t
                  ? { color: '#e5e7eb', borderBottom: '1px solid #ca8a04' }
                  : { color: '#4b5563' }
              }
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {tab === 'profile' && (
            <>
              {/* Name */}
              <div className="flex flex-col gap-2">
                <label className="font-sans text-[10px] uppercase tracking-[0.25em] text-gray-600">
                  Name
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="font-sans rounded px-3 py-2 text-sm text-gray-200 focus:outline-none transition-colors"
                  style={{ background: '#000', border: '1px solid #1f2937' }}
                />
              </div>

              {/* Year */}
              <div className="flex flex-col gap-2">
                <label className="font-sans text-[10px] uppercase tracking-[0.25em] text-gray-600">
                  Year
                </label>
                <div className="flex flex-wrap gap-2">
                  {YEAR_OPTIONS.map(y => (
                    <button
                      key={y}
                      onClick={() => setYear(y)}
                      className="px-3 py-1 font-sans text-xs rounded transition-colors"
                      style={
                        year === y
                          ? { border: '1px solid #a16207', color: '#eab308', background: 'rgba(113,63,18,0.2)' }
                          : { border: '1px solid #1f2937', color: '#6b7280' }
                      }
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Courses */}
              <div className="flex flex-col gap-2">
                <label className="font-sans text-[10px] uppercase tracking-[0.25em] text-gray-600">
                  Courses
                </label>
                {courses.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {courses.map(c => (
                      <div
                        key={c}
                        className="flex items-center gap-1 px-2 py-1 rounded"
                        style={{ border: '1px solid #1f2937', background: '#0d0d1a' }}
                      >
                        <span className="font-sans text-xs text-gray-300">{c}</span>
                        <button
                          onClick={() => removeCourse(c)}
                          className="font-sans text-gray-700 hover:text-red-500 text-xs transition-colors ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-1">
                  <input
                    value={courseInput}
                    onChange={e => setCourseInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCourse() } }}
                    placeholder="Add a course..."
                    className="font-sans flex-1 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none transition-colors"
                    style={{ background: '#000', border: '1px solid #1f2937' }}
                  />
                  <button
                    onClick={addCourse}
                    className="font-sans px-3 py-2 text-xs uppercase tracking-widest rounded transition-colors text-gray-500 hover:text-gray-200"
                    style={{ border: '1px solid #374151' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'history' && (
            sessions.length === 0 ? (
              <p className="font-sans text-xs text-gray-700 text-center py-8 tracking-widest uppercase">
                No sessions yet
              </p>
            ) : (
              <div className="flex flex-col">
                {[...sessions].reverse().map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-3"
                    style={{ borderBottom: '1px solid #111122' }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-sans text-xs text-gray-300">
                        {MODE_LABELS[s.mode]}
                        {s.examTopic ? ` — ${s.examTopic}` : ''}
                      </span>
                      <span className="font-sans text-[10px] text-gray-700">
                        {formatDate(s.date)}
                      </span>
                    </div>
                    <span className="font-sans text-xs text-gray-600">
                      {formatDuration(s.durationSeconds)}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {tab === 'profile' && (
          <div className="px-6 py-4 flex justify-end" style={{ borderTop: '1px solid #1a1a2e' }}>
            <button
              onClick={() => { onSave({ name: name.trim() || userName, year, courses }); onClose() }}
              className="font-sans px-6 py-2 text-xs uppercase tracking-widest rounded transition-colors duration-200"
              style={{ border: '1px solid #a16207', color: '#eab308' }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
