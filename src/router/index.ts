import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useAppStore } from '@/stores/appStore';

const routes: readonly RouteRecordRaw[] = [
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppShell.vue'),
    children: [
      { path: '', redirect: { name: 'dashboard' } },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      {
        path: 'opportunities',
        name: 'opportunities',
        component: () => import('@/views/OpportunitiesView.vue'),
      },
      {
        path: 'allocations',
        name: 'allocations',
        component: () => import('@/views/AllocateView.vue'),
      },
      {
        path: 'transactions',
        name: 'transactions',
        component: () => import('@/views/TransactionsView.vue'),
      },
      { path: 'forecast', name: 'forecast', component: () => import('@/views/ForecastView.vue') },
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const app = useAppStore();

  // 引导可能由 App.vue 或首次导航触发：无论何种顺序，都必须等它结束再决定路由，
  // 否则会在「元信息尚未读取」时错误放行到 Dashboard。
  if (!app.bootSettled) {
    try {
      await app.bootstrap();
    } catch {
      // 引导失败时 App.vue 会展示错误页，此处放行避免导航被阻断
      return true;
    }
  }

  if (app.bootStatus === 'failed') return true;

  if (app.meta && !app.meta.onboarded && !app.meta.userCleared && to.name !== 'onboarding') {
    return { name: 'onboarding' };
  }

  if (to.name === 'onboarding' && app.onboarded) {
    return { name: 'dashboard' };
  }

  return true;
});
