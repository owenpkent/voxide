import { describe, it, expect } from 'vitest'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Path validation — mirrors isPathWithinProject() from main-voxide.ts.
// Ensures file system operations cannot escape the project directory.
// ---------------------------------------------------------------------------

function isPathWithinProject(targetPath: string, projectRoot: string | null): boolean {
  if (!projectRoot) return false
  const resolved = path.resolve(targetPath)
  return resolved.startsWith(projectRoot + path.sep) || resolved === projectRoot
}

describe('isPathWithinProject', () => {
  const projectRoot = 'C:\\Users\\Owen\\projects\\my-app'

  it('allows a file inside the project root', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\projects\\my-app\\src\\index.ts', projectRoot)).toBe(true)
  })

  it('allows a deeply nested file', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\projects\\my-app\\src\\components\\Button\\index.tsx', projectRoot)).toBe(true)
  })

  it('allows the project root itself', () => {
    expect(isPathWithinProject(projectRoot, projectRoot)).toBe(true)
  })

  it('rejects a path outside the project', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\other-project\\file.ts', projectRoot)).toBe(false)
  })

  it('rejects a path traversal with ../', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\projects\\my-app\\..\\..\\etc\\passwd', projectRoot)).toBe(false)
  })

  it('rejects a sibling directory with similar prefix', () => {
    // my-app-evil should NOT match my-app
    expect(isPathWithinProject('C:\\Users\\Owen\\projects\\my-app-evil\\malicious.ts', projectRoot)).toBe(false)
  })

  it('rejects system paths', () => {
    expect(isPathWithinProject('C:\\Windows\\System32\\config\\SAM', projectRoot)).toBe(false)
  })

  it('rejects when projectRoot is null', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\projects\\my-app\\file.ts', null)).toBe(false)
  })

  it('rejects parent directory of project root', () => {
    expect(isPathWithinProject('C:\\Users\\Owen\\projects', projectRoot)).toBe(false)
  })

  it('rejects home directory', () => {
    expect(isPathWithinProject('C:\\Users\\Owen', projectRoot)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fuzzy file matching — mirrors the logic in useVoiceCommands.ts
// when the user says "open App.tsx" and we need to find the file in the tree.
// ---------------------------------------------------------------------------

function fuzzyMatchFile(filename: string, fileTree: string[]): string | null {
  // Exact basename match first
  const exact = fileTree.find(f => {
    const base = f.split(/[/\\]/).pop() || ''
    return base.toLowerCase() === filename.toLowerCase()
  })
  if (exact) return exact

  // Partial match
  const partial = fileTree.find(f => {
    const base = f.split(/[/\\]/).pop() || ''
    return base.toLowerCase().includes(filename.toLowerCase())
  })
  return partial || null
}

describe('fuzzyMatchFile', () => {
  const files = [
    'C:\\project\\src\\App.tsx',
    'C:\\project\\src\\index.ts',
    'C:\\project\\src\\components\\Button.tsx',
    'C:\\project\\src\\hooks\\useAuth.ts',
    'C:\\project\\package.json',
    'C:\\project\\README.md',
    'C:\\project\\tsconfig.json',
  ]

  it('finds exact basename match (case insensitive)', () => {
    expect(fuzzyMatchFile('App.tsx', files)).toBe('C:\\project\\src\\App.tsx')
  })

  it('finds match regardless of case', () => {
    expect(fuzzyMatchFile('app.tsx', files)).toBe('C:\\project\\src\\App.tsx')
  })

  it('finds match with uppercase', () => {
    expect(fuzzyMatchFile('README.md', files)).toBe('C:\\project\\README.md')
  })

  it('finds partial match when exact fails', () => {
    expect(fuzzyMatchFile('Button', files)).toBe('C:\\project\\src\\components\\Button.tsx')
  })

  it('finds partial match for "auth"', () => {
    expect(fuzzyMatchFile('auth', files)).toBe('C:\\project\\src\\hooks\\useAuth.ts')
  })

  it('finds package.json', () => {
    expect(fuzzyMatchFile('package.json', files)).toBe('C:\\project\\package.json')
  })

  it('returns null for no match', () => {
    expect(fuzzyMatchFile('nonexistent.ts', files)).toBeNull()
  })

  it('returns null for empty file tree', () => {
    expect(fuzzyMatchFile('App.tsx', [])).toBeNull()
  })

  it('prefers exact match over partial match', () => {
    const filesWithSimilar = [
      'C:\\project\\AppController.tsx',
      'C:\\project\\App.tsx',
    ]
    expect(fuzzyMatchFile('App.tsx', filesWithSimilar)).toBe('C:\\project\\App.tsx')
  })
})

// ---------------------------------------------------------------------------
// File extension to language mapping — mirrors getLanguage() in VoxIDEApp.tsx
// ---------------------------------------------------------------------------

function getLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    swift: 'swift', rb: 'ruby', php: 'php', cs: 'csharp', cpp: 'cpp',
    c: 'c', h: 'c', md: 'markdown', json: 'json', yaml: 'yaml',
    yml: 'yaml', html: 'html', css: 'css', scss: 'scss', sql: 'sql',
    sh: 'shell', bash: 'shell', xml: 'xml', toml: 'ini',
  }
  return langMap[ext || ''] || 'plaintext'
}

describe('getLanguage', () => {
  it('returns typescript for .ts files', () => {
    expect(getLanguage('src/main.ts')).toBe('typescript')
  })

  it('returns typescript for .tsx files', () => {
    expect(getLanguage('App.tsx')).toBe('typescript')
  })

  it('returns javascript for .js files', () => {
    expect(getLanguage('index.js')).toBe('javascript')
  })

  it('returns python for .py files', () => {
    expect(getLanguage('script.py')).toBe('python')
  })

  it('returns rust for .rs files', () => {
    expect(getLanguage('main.rs')).toBe('rust')
  })

  it('returns markdown for .md files', () => {
    expect(getLanguage('README.md')).toBe('markdown')
  })

  it('returns json for .json files', () => {
    expect(getLanguage('package.json')).toBe('json')
  })

  it('returns yaml for .yml files', () => {
    expect(getLanguage('config.yml')).toBe('yaml')
  })

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguage('file.xyz')).toBe('plaintext')
  })

  it('returns plaintext for null', () => {
    expect(getLanguage(null)).toBe('plaintext')
  })

  it('returns shell for .sh files', () => {
    expect(getLanguage('deploy.sh')).toBe('shell')
  })

  it('returns c for .h header files', () => {
    expect(getLanguage('stdio.h')).toBe('c')
  })

  it('handles full paths correctly', () => {
    expect(getLanguage('C:\\Users\\Owen\\project\\src\\utils\\helpers.ts')).toBe('typescript')
  })
})
