import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * 「安装为应用」支持。
 *
 * 除了更好的使用体验，安装还有一层实际价值：
 * Chrome / Edge 会因此把本站视为用户重视的站点，从而更容易授予持久化存储许可，
 * 降低数据被浏览器自动清理的风险。
 */
export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
  const installed = ref(false);
  const installing = ref(false);

  const canInstall = computed(() => deferredPrompt.value !== null && !installed.value);

  function detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return standaloneMedia || iosStandalone;
  }

  function onBeforeInstallPrompt(event: Event): void {
    // 阻止浏览器自带的迷你信息栏，改由应用在设置页提供明确的安装入口
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
  }

  function onInstalled(): void {
    installed.value = true;
    deferredPrompt.value = null;
  }

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt.value;
    if (!event) return 'unavailable';
    installing.value = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        installed.value = true;
        deferredPrompt.value = null;
      }
      return choice.outcome;
    } finally {
      installing.value = false;
    }
  }

  onMounted(() => {
    installed.value = detectStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  });

  return { canInstall, installed, installing, promptInstall };
}
