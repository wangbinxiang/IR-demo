import { create } from 'zustand'

// 当前打开的项目（id + 名称）。id 为 null 表示尚未保存的新项目。
interface ProjectState {
  id: string | null
  name: string
  setProject: (id: string | null, name: string) => void
}

const LS_KEY = 'ir-demo:project' // 记住当前项目 id，刷新后自动恢复

export const useProject = create<ProjectState>((set) => ({
  id: localStorage.getItem(LS_KEY),
  name: '未命名',
  setProject: (id, name) => {
    if (id) localStorage.setItem(LS_KEY, id)
    else localStorage.removeItem(LS_KEY)
    set({ id, name })
  },
}))

// e2e 调试钩子
if (typeof window !== 'undefined') (window as unknown as { __project: typeof useProject }).__project = useProject
