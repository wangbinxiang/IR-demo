import { create } from 'zustand'

// 当前在画布上选中的 IR 节点 id（单选；多选/空选为 null）。
// 由 App 里监听 tldraw 选中变化来写入，StylePanel 读取。
interface SelectionState {
  selectedId: string | null
  setSelected: (id: string | null) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  setSelected: (id) => set({ selectedId: id }),
}))

// e2e 调试钩子
if (typeof window !== 'undefined') (window as unknown as { __selection: typeof useSelection }).__selection = useSelection
