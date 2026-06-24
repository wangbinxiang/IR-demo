// ============================================================================
// 布局后溢出纠正：前置启发式(R1/R1b/R2/R3)用「视口宽」近似判断，无法可靠抓住
// 「容器相对溢出」——尤其 hug 内容(footer 版权+链接)、小于视口但放不进父容器的 fixed
// (订阅输入框 320)。这里在真实布局后用测量到的几何检测溢出的 row 并塌列，迭代至稳定。
// 画布(sync)与导出(emitHTML)都消费它 → canvas=code，导出也一并修好。
// ============================================================================
import type { IR, NodeId } from '../ir/types'
import { isContainer } from '../ir/types'
import { responsiveTransform, collapseRows } from './responsive'
import { layoutIR, type LayoutResult } from './yoga'

const OVERFLOW_TOL = 4 // 容差：超出父内容区超过 4px 才算溢出（避免取整/测量误差误判）
const MAX_PASSES = 3 // 迭代上限：塌列会改变内层布局，最多重检几次

// 找出「子元素实际超出父内容区右缘」的 row 容器（用真实布局几何，hug/fixed/混合都能抓）
function findOverflowingRows(ir: IR, layout: LayoutResult): Set<NodeId> {
  const ids = new Set<NodeId>()
  for (const [id, node] of Object.entries(ir.nodes)) {
    if (!isContainer(node) || !node.layout || node.layout.direction !== 'row') continue
    if (node.childIds.length < 2) continue // 单子元素的 row 不会"挤"溢出
    const r = layout.get(id)
    if (!r) continue
    const contentRight = r.x + r.w - node.layout.padding // 父内容区右缘
    let maxRight = -Infinity
    for (const cid of node.childIds) {
      const cr = layout.get(cid)
      if (cr) maxRight = Math.max(maxRight, cr.x + cr.w)
    }
    if (maxRight > contentRight + OVERFLOW_TOL) ids.add(id) // 子最右越界 → 溢出
  }
  return ids
}

// 返回「该视口下纠正溢出后」的 IR：前置变换 → 布局 → 检测溢出 row → 塌列 → 迭代。
export function responsiveCorrect(ir: IR, viewportWidth: number): IR {
  let current = responsiveTransform(ir, viewportWidth) // 先跑 R1/R1b/R2/R3
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let layout: LayoutResult
    try {
      layout = layoutIR(current, { rootWidth: viewportWidth }) // origin 无关（只看相对溢出）
    } catch {
      return current // yoga 未就绪(如 SSR) → 退回前置变换，不纠正
    }
    const overflowing = findOverflowingRows(current, layout)
    if (overflowing.size === 0) break // 稳定，无溢出
    current = collapseRows(current, overflowing) // 塌列后再次重检
  }
  return current
}
