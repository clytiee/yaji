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
    // 截图当前活动标签页的可见区域
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 })
      .then(dataUrl => {
        console.log('[Background] 截图成功，数据长度:', dataUrl.length);
        sendResponse({ success: true, dataUrl: dataUrl });
      })
      .catch(error => {
        console.error('[Background] 截图失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放，等待异步响应
  }
});

// background.js

// 创建菜单
function createMenus() {
  // 先清除所有菜单，避免重复
  chrome.contextMenus.removeAll(() => {
    // 读取保存的状态
    chrome.storage.sync.get(['smartMode', 'silentMode'], (result) => {
      const smartMode = result.smartMode || false;
      const silentMode = result.silentMode || false;
      
      // 创建菜单，根据保存的值设置标题（带勾选标记）
      chrome.contextMenus.create({
        id: 'toggle-smart-mode',
        title: smartMode ? '✓ 智能模式（自动识别标题/作者）' : '智能模式（自动识别标题/作者）',
        contexts: ['action']
      });
      
      chrome.contextMenus.create({
        id: 'toggle-silent-mode',
        title: silentMode ? '✓ 静默模式（不显示提示消息）' : '静默模式（不显示提示消息）',
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

// 处理菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-smart-mode') {
    // 切换状态
    chrome.storage.sync.get(['smartMode'], (result) => {
      const newValue = !(result.smartMode || false);
      chrome.storage.sync.set({ smartMode: newValue }, () => {
        // 重新创建菜单，更新勾选状态
        createMenus();
        
        // 通知当前页面
        chrome.tabs.sendMessage(tab.id, { 
          action: 'SHOW_TOAST', 
          message: newValue ? '智能模式已开启' : '智能模式已关闭' 
        });
      });
    });
  }
  
  if (info.menuItemId === 'toggle-silent-mode') {
    chrome.storage.sync.get(['silentMode'], (result) => {
      const newValue = !(result.silentMode || false);
      chrome.storage.sync.set({ silentMode: newValue }, () => {
        createMenus();
        
        chrome.tabs.sendMessage(tab.id, { 
          action: 'SHOW_TOAST', 
          message: newValue ? '静默模式已开启（不再显示提示）' : '静默模式已关闭' 
        });
      });
    });
  }
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-smart-mode') {
    chrome.storage.sync.get(['smartMode'], (result) => {
      const newState = !result.smartMode;
      chrome.storage.sync.set({ smartMode: newState });
      
      // 更新菜单标题显示状态
      const menuTitle = newState ? '✓ 智能模式（已开启）' : '智能模式（已关闭）';
      chrome.contextMenus.update('toggle-smart-mode', { title: menuTitle });
      
      // 向当前页面发送消息显示提示
      chrome.tabs.sendMessage(tab.id, { 
        action: 'SHOW_TOAST', 
        message: newState ? '🧠 智能模式已开启' : '📝 手动模式'
      }).catch(() => {
        // 忽略错误（可能没有 content script）
      });
    });
  }
  if (info.menuItemId === 'toggle-silent-mode') {
    chrome.storage.sync.get(['silentMode'], (result) => {
      const newState = !result.silentMode;
      chrome.storage.sync.set({ silentMode: newState });
      
      // 更新菜单标题显示状态
      const menuTitle = newState ? '✓ 静默模式（已开启）' : '静默模式（已关闭）';
      chrome.contextMenus.update('toggle-silent-mode', { title: menuTitle });
      
      // 向当前页面发送消息显示提示
      chrome.tabs.sendMessage(tab.id, { 
        action: 'SHOW_TOAST', 
        message: newState ? '静默模式已开启' : '非静默模式'
      }).catch(() => {
        // 忽略错误（可能没有 content script）
      });
    });
  }
});

// 打开选项页
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-smart-mode') {
    chrome.storage.sync.get(['smartMode'], (result) => {
      const newState = !result.smartMode;
      chrome.storage.sync.set({ smartMode: newState });
      
      // 更新菜单标题
      const menuTitle = newState ? '✓ 智能模式（已开启）' : '智能模式（已关闭）';
      chrome.contextMenus.update('toggle-smart-mode', { title: menuTitle });
      
      // 通知当前页面显示提示
      chrome.tabs.sendMessage(tab.id, { 
        action: 'SHOW_TOAST', 
        message: newState ? '🧠 智能模式已开启（第1行→标题，第2行→作者）' : '📝 手动模式已开启'
      }).catch(() => {});
    });
  }
});