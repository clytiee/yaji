async function sendMessageToTab(tabId, message) {
  try {
    // 先检查 content script 是否就绪
    const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (response === 'PONG') {
      await chrome.tabs.sendMessage(tabId, message);
    }
  } catch (error) {
    console.log('Content script 未就绪，跳过消息:', error.message);
  }
}

// 点击插件图标时获取选中的文字并激活选择模式
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Background] 插件图标被点击');
  
  try {
    let selectedText = '';
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          return selection ? selection.toString().trim() : '';
        }
      });
      selectedText = result[0]?.result || '';
      console.log('[Background] 获取到选中文字:', selectedText);
    } catch (e) {
      console.error('[Background] 获取选中文字失败:', e);
    }
    
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'ACTIVATE_MODE',
        selectedText: selectedText 
      });
    } catch (err) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'ACTIVATE_MODE',
            selectedText: selectedText 
          });
        } catch (e) {
          console.error('[Background] 激活失败:', e);
        }
      }, 100);
    }
  } catch (error) {
    console.error('[Background] 激活模式出错:', error);
  }
});

// 监听来自 content script 的截图请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] 收到消息:', request);
  
  if (request.action === 'CAPTURE_PANEL') {
    console.log('[Background] 开始截图...');
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 })
      .then(dataUrl => {
        console.log('[Background] 截图成功，数据长度:', dataUrl.length);
        sendResponse({ success: true, dataUrl: dataUrl });
      })
      .catch(error => {
        console.error('[Background] 截图失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// 创建菜单
function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.storage.sync.get(['smartMode', 'silentMode', 'plainMode'], (result) => {
      const smartMode = result.smartMode || false;
      const silentMode = result.silentMode || false;
      const plainMode = result.plainMode || false;
      
      // 智能模式
      chrome.contextMenus.create({
        id: 'toggle-smart-mode',
        title: smartMode ? '✓ 智能模式（自动识别标题/作者）' : '智能模式（自动识别标题/作者）',
        contexts: ['action']
      });
      
      // 静默模式
      chrome.contextMenus.create({
        id: 'toggle-silent-mode',
        title: silentMode ? '✓ 静默模式（不显示提示消息）' : '静默模式（不显示提示消息）',
        contexts: ['action']
      });

      // 无图模式 - 修复：使用 plainMode，不是 silentMode
      chrome.contextMenus.create({
        id: 'toggle-plain-mode',
        title: plainMode ? '✓ 无图模式（不显示背景图）' : '无图模式（不显示背景图）',
        contexts: ['action']
      });

      // 背景图设置
      chrome.contextMenus.create({
        id: 'open-options',
        title: '选项：背景图等设置',
        contexts: ['action']
      });
    });
  });
}

// 扩展安装/更新时创建菜单
chrome.runtime.onInstalled.addListener(() => {
  createMenus();
});

// 扩展启动时也创建（防止菜单丢失）
chrome.runtime.onStartup.addListener(() => {
  createMenus();
});

// 处理菜单点击（合并到一个监听器中）
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // 智能模式切换
  if (info.menuItemId === 'toggle-smart-mode') {
    chrome.storage.sync.get(['smartMode'], (result) => {
      const newValue = !(result.smartMode || false);
      chrome.storage.sync.set({ smartMode: newValue }, () => {
        createMenus();
        sendMessageToTab(tab.id, { 
          action: 'SHOW_TOAST', 
          message: newValue ? '🧠 智能模式已开启' : '📝 手动模式已开启'
        });
      });
    });
  }
  
  // 静默模式切换
  if (info.menuItemId === 'toggle-silent-mode') {
    chrome.storage.sync.get(['silentMode'], (result) => {
      const newValue = !(result.silentMode || false);
      chrome.storage.sync.set({ silentMode: newValue }, () => {
        createMenus();
        sendMessageToTab(tab.id, { 
          action: 'SHOW_TOAST', 
          message: newValue ? '🔇 静默模式已开启' : '🔊 静默模式已关闭'
        });
      });
    });
  }

  // 无图模式切换
  if (info.menuItemId === 'toggle-plain-mode') {
    chrome.storage.sync.get(['plainMode'], (result) => {
      const newValue = !(result.plainMode || false);
      console.log("plainMode:", result.plainMode, "newValue:", newValue);
      chrome.storage.sync.set({ plainMode: newValue }, () => {
        createMenus();
        sendMessageToTab(tab.id, { 
          action: 'SHOW_TOAST', 
          message: newValue ? '🖼️ 无图模式已开启' : '🎨 背景图模式已开启'
        });
      });
    });
  }

  // 打开选项页
  if (info.menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});