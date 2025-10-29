import { useEffect, useMemo, useState } from 'react'

type VersionJson = {
  sha?: string
  message?: string
  time?: string
  branch?: string
}

function firstLine(s?: string | null) {
  if (!s) return undefined
  const i = s.indexOf('\n')
  return i === -1 ? s : s.slice(0, i)
}

export default function BuildInfo() {
  const [versionFile, setVersionFile] = useState<VersionJson | null>(null)

  // Env-provided metadata (e.g., GitHub Actions, Docker build args)
  const envSha = (import.meta.env.VITE_COMMIT_SHA as string | undefined) || undefined
  const envMessage = (import.meta.env.VITE_COMMIT_MESSAGE as string | undefined) || undefined
  const envTime = (import.meta.env.VITE_BUILD_TIME as string | undefined) || undefined
  const envBranch = (import.meta.env.VITE_BUILD_BRANCH as string | undefined) || undefined

  useEffect(() => {
    // Optional backend-provided metadata when serving static from backend
    // Not critical for GitHub Pages; ignore if missing
    fetch((import.meta.env.BASE_URL || '/') + 'version.json', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null
        try {
          return (await res.json()) as VersionJson
        } catch {
          return null
        }
      })
      .then((json) => setVersionFile(json))
      .catch(() => setVersionFile(null))
  }, [])

  const sha = versionFile?.sha || envSha
  const shortSha = useMemo(() => (sha ? sha.slice(0, 7) : undefined), [sha])
  const message = firstLine(versionFile?.message || envMessage)
  const time = versionFile?.time || envTime
  const branch = versionFile?.branch || envBranch

  if (!sha && !message && !time) {
    return null
  }

  return (
    <footer className="mt-8 border-t border-gray-200 pt-2 text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span>Build</span>
        {shortSha && (
          <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-700">{shortSha}</code>
        )}
        {branch && <span>on {branch}</span>}
        {message && <span>— {message}</span>}
      </div>
      {time && <span>{new Date(time).toLocaleString()}</span>}
    </footer>
  )
}