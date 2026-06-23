import type { CSSProperties, ReactNode } from 'react'
import { useIRStore } from '../ir/store'
import type { Op } from '../ir/ops'
import type { IRNode, LayoutProps, Sizing, StyleProps } from '../ir/types'
import { isContainer } from '../ir/types'
import { useSelection } from './selection'

// 右侧样式面板：选中画布元素后，编辑其尺寸/布局/样式/内容。
// 所有改动都走与 AI 改图共用的 op（setSizing/setLayout/setStyle/setProps）。
export function StylePanel() {
  const selectedId = useSelection((s) => s.selectedId)
  const applyOps = useIRStore((s) => s.applyOps)
  // 订阅 version 以在 op 套用后刷新控件值
  const node = useIRStore((s) => (selectedId ? s.ir.nodes[selectedId] : null))
  useIRStore((s) => s.version)

  if (!selectedId || !node) return null
  const dispatch = (op: Op) => applyOps([op])
  const id = node.id

  return (
    <div style={panel} data-panel="style">
      <div style={head}>
        <span style={{ fontWeight: 700 }}>{node.type}</span>
        <span style={{ color: '#a1a1aa', fontSize: 11 }}>#{id}</span>
      </div>
      <div style={body}>
        {/* 尺寸 */}
        <Section title="尺寸">
          <SizingRow label="宽" sizing={node.width} onChange={(v) => dispatch({ op: 'setSizing', id, axis: 'width', value: v })} />
          <SizingRow label="高" sizing={node.height} onChange={(v) => dispatch({ op: 'setSizing', id, axis: 'height', value: v })} />
        </Section>

        {/* 布局（仅容器） */}
        {isContainer(node) && node.layout && (
          <Section title="布局">
            <LayoutControls layout={node.layout} onChange={(l) => dispatch({ op: 'setLayout', id, layout: l })} />
          </Section>
        )}

        {/* 样式 */}
        <Section title="外观">
          <StyleControls node={node} onChange={(s) => dispatch({ op: 'setStyle', id, style: s })} />
        </Section>

        {/* 内容 */}
        {(node.type === 'text' || node.type === 'button') && (
          <Section title="文本">
            <TextRow
              label="文案"
              value={node.props.text ?? ''}
              onChange={(text) => dispatch({ op: 'setProps', id, props: { text } })}
            />
          </Section>
        )}
        {node.type === 'input' && (
          <Section title="内容">
            <TextRow
              label="占位符"
              value={node.props.placeholder ?? ''}
              onChange={(placeholder) => dispatch({ op: 'setProps', id, props: { placeholder } })}
            />
          </Section>
        )}
      </div>
    </div>
  )
}

// —— 尺寸三态控件 ——
function SizingRow({ label, sizing, onChange }: { label: string; sizing: Sizing; onChange: (v: 'hug' | 'fill' | number) => void }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <div style={seg}>
        <SegBtn active={sizing.mode === 'hug'} onClick={() => onChange('hug')}>Hug</SegBtn>
        <SegBtn active={sizing.mode === 'fill'} onClick={() => onChange('fill')}>Fill</SegBtn>
        <SegBtn active={sizing.mode === 'fixed'} onClick={() => onChange(sizing.mode === 'fixed' ? sizing.value : 100)}>Fixed</SegBtn>
      </div>
      {sizing.mode === 'fixed' && (
        <input type="number" style={numInput} value={sizing.value} onChange={(e) => onChange(Math.max(0, +e.target.value))} />
      )}
    </div>
  )
}

// —— 布局控件 ——
function LayoutControls({ layout, onChange }: { layout: LayoutProps; onChange: (l: Partial<LayoutProps>) => void }) {
  return (
    <>
      <div style={row}>
        <span style={rowLabel}>方向</span>
        <div style={seg}>
          <SegBtn active={layout.direction === 'col'} onClick={() => onChange({ direction: 'col' })}>列 ↓</SegBtn>
          <SegBtn active={layout.direction === 'row'} onClick={() => onChange({ direction: 'row' })}>行 →</SegBtn>
        </div>
      </div>
      <NumRow label="间距" value={layout.gap} onChange={(gap) => onChange({ gap })} />
      <NumRow label="内边距" value={layout.padding} onChange={(padding) => onChange({ padding })} />
      <SelectRow label="主轴" value={layout.justify} options={['start', 'center', 'end', 'between']} onChange={(justify) => onChange({ justify: justify as LayoutProps['justify'] })} />
      <SelectRow label="交叉轴" value={layout.align} options={['start', 'center', 'end', 'stretch']} onChange={(align) => onChange({ align: align as LayoutProps['align'] })} />
    </>
  )
}

// —— 外观控件 ——
function StyleControls({ node, onChange }: { node: IRNode; onChange: (s: Partial<StyleProps>) => void }) {
  const s = node.style
  const isText = node.type === 'text' || node.type === 'button' || node.type === 'input'
  return (
    <>
      <ColorRow label="背景" value={s.fill} onChange={(fill) => onChange({ fill })} />
      <ColorRow label="边框色" value={s.borderColor} onChange={(borderColor) => onChange({ borderColor })} />
      <NumRow label="边框宽" value={s.borderWidth ?? 0} onChange={(borderWidth) => onChange({ borderWidth })} />
      <NumRow label="圆角" value={s.radius ?? 0} onChange={(radius) => onChange({ radius })} />
      {isText && (
        <>
          <ColorRow label="文字色" value={s.color} onChange={(color) => onChange({ color })} />
          <NumRow label="字号" value={s.fontSize ?? 14} onChange={(fontSize) => onChange({ fontSize })} />
          <SelectRow
            label="字重"
            value={String(s.fontWeight ?? 400)}
            options={['400', '500', '600', '700']}
            onChange={(v) => onChange({ fontWeight: +v })}
          />
        </>
      )}
    </>
  )
}

// —— 通用小控件 ——
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  )
}
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button style={segBtn(active)} onClick={onClick}>
      {children}
    </button>
  )
}
function NumRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <input type="number" style={numInput} value={value} onChange={(e) => onChange(Math.max(0, +e.target.value))} />
    </div>
  )
}
function ColorRow({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <input type="color" style={colorInput} value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      <span style={{ fontSize: 11, color: '#a1a1aa' }}>{value ?? '—'}</span>
    </div>
  )
}
function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <select style={select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
function TextRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={row}>
      <span style={rowLabel}>{label}</span>
      <input style={textInput} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// —— 样式 ——
const panel: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  bottom: 76,
  width: 248,
  zIndex: 999,
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, sans-serif',
  overflow: 'hidden',
}
const head: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '12px 14px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 14,
}
const body: CSSProperties = { padding: 8, overflowY: 'auto' }
const section: CSSProperties = { padding: '8px 6px', borderBottom: '1px solid #f7f7f8' }
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '0 4px' }
const rowLabel: CSSProperties = { width: 44, fontSize: 12, color: '#52525b', flexShrink: 0 }
const seg: CSSProperties = { display: 'flex', gap: 2, background: '#f4f4f5', borderRadius: 6, padding: 2 }
const segBtn = (active: boolean): CSSProperties => ({
  padding: '3px 8px',
  fontSize: 11,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  background: active ? '#4f46e5' : 'transparent',
  color: active ? '#fff' : '#52525b',
})
const numInput: CSSProperties = { width: 52, height: 26, border: '1px solid #e4e4e7', borderRadius: 6, padding: '0 6px', fontSize: 12 }
const textInput: CSSProperties = { flex: 1, height: 26, border: '1px solid #e4e4e7', borderRadius: 6, padding: '0 6px', fontSize: 12, minWidth: 0 }
const colorInput: CSSProperties = { width: 32, height: 26, border: '1px solid #e4e4e7', borderRadius: 6, padding: 0, cursor: 'pointer' }
const select: CSSProperties = { flex: 1, height: 26, border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12 }
