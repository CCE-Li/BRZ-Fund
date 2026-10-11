import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MoneyText from '@/components/ui/MoneyText.vue';
import StatCard from '@/components/ui/StatCard.vue';
import ProgressBar from '@/components/ui/ProgressBar.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import MoneyInput from '@/components/ui/MoneyInput.vue';

/**
 * 组件测试覆盖渲染、格式化、状态类名与无障碍契约。
 *
 * 关于交互：当前 jsdom + Vite + Vue 3.5 的组合下，SFC 编译出的原生事件处理器
 * 不会在合成事件中被调用（已实测：原生 addEventListener 可触发，编译产物的
 * onInput 处理器不触发）。因此所有真实输入交互由 Playwright E2E 覆盖，
 * 金额解析等业务逻辑由 domain/utils 单测覆盖，避免在此重复或伪造。
 */
describe('MoneyText', () => {
  it('按币种格式化并支持正负号', () => {
    const wrapper = mount(MoneyText, {
      props: { cents: 123456, currency: 'CNY', locale: 'zh-CN' },
    });
    expect(wrapper.text()).toContain('1,234.56');

    const negative = mount(MoneyText, {
      props: { cents: -5000, currency: 'CNY', locale: 'zh-CN', signed: true },
    });
    expect(negative.text()).toContain('50.00');
    expect(negative.text().startsWith('+')).toBe(false);

    const positive = mount(MoneyText, {
      props: { cents: 5000, currency: 'CNY', locale: 'zh-CN', signed: true },
    });
    expect(positive.text().startsWith('+')).toBe(true);
  });

  it('应用 tone 与 size 类名', () => {
    const wrapper = mount(MoneyText, {
      props: { cents: 100, tone: 'positive', size: 'xl' },
    });
    expect(wrapper.classes()).toContain('money--positive');
    expect(wrapper.classes()).toContain('money--xl');
  });
});

describe('StatCard', () => {
  it('渲染标签、数值与提示', () => {
    const wrapper = mount(StatCard, {
      props: { label: '购车基金余额', value: '¥1,000.00', hint: '目标 ¥60,000.00' },
    });
    expect(wrapper.text()).toContain('购车基金余额');
    expect(wrapper.text()).toContain('¥1,000.00');
    expect(wrapper.text()).toContain('目标 ¥60,000.00');
  });

  it('tone 与 size 影响类名', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'l', value: 'v', tone: 'warning', size: 'lg' },
    });
    expect(wrapper.classes()).toContain('tile--warning');
    expect(wrapper.classes()).toContain('tile--lg');
  });

  it('展示标签前的图标与数值后的单位', () => {
    const wrapper = mount(StatCard, {
      props: { label: 'l', value: '1,000', icon: 'wallet', unit: 'CNY' },
    });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.text()).toContain('CNY');
  });
});

describe('ProgressBar', () => {
  it('钳制超范围数值并暴露无障碍属性', () => {
    const wrapper = mount(ProgressBar, { props: { percent: 150 } });
    const track = wrapper.get('[role="progressbar"]');
    expect(track.attributes('aria-valuenow')).toBe('100');

    const negative = mount(ProgressBar, { props: { percent: -20 } });
    expect(negative.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
  });

  it('按百分比点亮对应数量的方块', () => {
    const wrapper = mount(ProgressBar, { props: { percent: 42, blocks: 32 } });
    // 42% × 32 ≈ 13 个点亮方块，其余为暗色轨道
    expect(wrapper.findAll('.pbar__block')).toHaveLength(32);
    expect(wrapper.findAll('.pbar__block--on')).toHaveLength(13);
  });

  it('0% 与 100% 的边界', () => {
    const empty = mount(ProgressBar, { props: { percent: 0, blocks: 20 } });
    expect(empty.findAll('.pbar__block--on')).toHaveLength(0);

    const full = mount(ProgressBar, { props: { percent: 100, blocks: 20 } });
    expect(full.findAll('.pbar__block--on')).toHaveLength(20);
  });
});

describe('BaseButton', () => {
  it('loading 或 disabled 时不可点击，且展示 loading 类', () => {
    const wrapper = mount(BaseButton, { props: { loading: true } });
    const button = wrapper.get('button');
    expect(button.attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('btn--loading');

    const disabled = mount(BaseButton, { props: { disabled: true } });
    expect(disabled.get('button').attributes('disabled')).toBeDefined();
  });

  it('variant、size、block 与 type 生效', () => {
    const wrapper = mount(BaseButton, {
      props: { variant: 'primary', size: 'lg', block: true, type: 'submit' },
    });
    expect(wrapper.classes()).toContain('btn--primary');
    expect(wrapper.classes()).toContain('btn--lg');
    expect(wrapper.classes()).toContain('btn--block');
    expect(wrapper.get('button').attributes('type')).toBe('submit');
  });
});

describe('BaseInput', () => {
  it('渲染标签、值、占位与无障碍属性', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: 'hello', label: '目标名称', placeholder: '请输入', hint: '提示文本' },
    });
    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('hello');
    expect(input.attributes('placeholder')).toBe('请输入');
    expect(wrapper.text()).toContain('目标名称');
    expect(wrapper.text()).toContain('提示文本');
    expect(input.attributes('aria-invalid')).toBe('false');
  });

  it('错误信息优先于提示并标记 aria-invalid', () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '', label: '金额', error: '金额必须大于 0', hint: '提示' },
    });
    expect(wrapper.text()).toContain('金额必须大于 0');
    expect(wrapper.text()).not.toContain('提示');
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
  });

  it('label 与 input 通过 for/id 正确关联', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', label: '目标名称' } });
    const label = wrapper.get('label');
    const input = wrapper.get('input');
    expect(label.attributes('for')).toBe(input.attributes('id'));
  });

  it('禁用状态传递到原生输入', () => {
    const wrapper = mount(BaseInput, { props: { modelValue: '', disabled: true } });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
  });
});

describe('MoneyInput', () => {
  it('已填金额回显为可编辑文本', () => {
    const wrapper = mount(MoneyInput, { props: { modelValue: 123456 } });
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('1234.56');
  });

  it('空值时输入框为空', () => {
    const wrapper = mount(MoneyInput, { props: { modelValue: null } });
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
  });

  it('展示货币后缀单位', () => {
    const wrapper = mount(MoneyInput, { props: { modelValue: 100, currency: '元' } });
    expect(wrapper.text()).toContain('元');
  });
});

describe('EmptyState', () => {
  it('展示标题、描述与操作插槽', () => {
    const wrapper = mount(EmptyState, {
      props: { title: '还没有数据', description: '先去登记一笔收入' },
      slots: { default: '<button>登记收入</button>' },
    });
    expect(wrapper.text()).toContain('还没有数据');
    expect(wrapper.text()).toContain('先去登记一笔收入');
    expect(wrapper.find('button').exists()).toBe(true);
  });

  it('没有描述与插槽时也能渲染', () => {
    const wrapper = mount(EmptyState, { props: { title: '空状态' } });
    expect(wrapper.text()).toContain('空状态');
    expect(wrapper.find('.empty__actions').exists()).toBe(false);
  });
});
