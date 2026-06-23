import { create } from 'zustand'

// 代码面板开关。开关按钮放在项目栏，面板本身读取此状态。
interface CodePanelState {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}
export const useCodePanel = create<CodePanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
