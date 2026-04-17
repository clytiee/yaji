// 生成 01-13 的默认背景图列表
const defaultBgImages = [];
for (let i = 1; i <= 100; i++) {
  const num = i.toString().padStart(2, '0');
  defaultBgImages.push({
    name: num,
    file: `image/${num}.jpg`,
    path: `image/${num}.jpg`
  });
}

let currentBgImage = '';
let currentOpacity = 0.7;
let customImages = [];
let previewHeight = 60; // 百分比
// 透明度跟随背景图变量
let opacityMemoryEnabled = false; // 是否开启记忆功能
let opacityMemoryMap = {}; // 存储每个背景图的透明度 {path: opacity}

// 加载保存的设置
function loadSettings() {
  chrome.storage.sync.get(['bgImage', 'bgOpacity', 'previewHeight', 'opacityMemoryEnabled', 'opacityMemoryMap'], (result) => {
    currentBgImage = result.bgImage || defaultBgImages[0].path;
    currentOpacity = result.bgOpacity || 0.7;
    previewHeight = result.previewHeight || 60;
    // 加载透明度跟随背景图设置
    opacityMemoryEnabled = result.opacityMemoryEnabled || false;
    opacityMemoryMap = result.opacityMemoryMap || {};
    
    // 设置复选框状态
    const memoryToggle = document.getElementById('opacity-memory-toggle');
    if (memoryToggle) {
      memoryToggle.checked = opacityMemoryEnabled;
      // 绑定复选框事件
      memoryToggle.addEventListener('change', toggleOpacityMemory);
    }

    // 如果开启跟随且当前背景图有保存的透明度，优先使用
    if (opacityMemoryEnabled && opacityMemoryMap[currentBgImage]) {
      currentOpacity = opacityMemoryMap[currentBgImage];
    }

    document.getElementById('opacity-slider').value = currentOpacity;
    document.getElementById('opacity-value').textContent = Math.round(currentOpacity * 100) + '%';
    
    // 设置预览高度
    const previewBox = document.getElementById('preview-box');
    if (previewBox) {
      previewBox.style.height = previewHeight + 'vh';
      document.getElementById('preview-height-value').textContent = previewHeight + '%';
    }
    
    // 加载完同步设置后，重新渲染列表（确保高亮正确）
    chrome.storage.local.get(['customImages'], (localResult) => {
      customImages = localResult.customImages || [];
      console.log('加载自定义图片:', customImages.length);
      renderBgList();
      updatePreview();
    });
  });
}

// 新增：切换透明度跟随背景图功能
function toggleOpacityMemory(e) {
  opacityMemoryEnabled = e.target.checked;
  // 保存开关状态
  chrome.storage.sync.set({ 
    opacityMemoryEnabled: opacityMemoryEnabled 
  }, () => {
    const statusText = opacityMemoryEnabled ? '✅ 已开启按背景图记忆透明度' : '❌ 已关闭按背景图记忆透明度';
    showStatus(statusText);
    
    // 如果开启，立即保存当前背景图的透明度
    if (opacityMemoryEnabled) {
      saveOpacityToMemory(currentBgImage, currentOpacity);
    }
  });
}

// 新增：保存透明度到记忆映射表
function saveOpacityToMemory(imagePath, opacity) {
  if (!opacityMemoryEnabled) return;
  
  opacityMemoryMap[imagePath] = opacity;
  // 保存到存储
  chrome.storage.sync.set({ 
    opacityMemoryMap: opacityMemoryMap 
  }, () => {
    console.log(`已保存 ${imagePath} 的透明度: ${opacity}`);
  });
}

// 判断图片是否存在函数
async function checkExtensionFileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' }); // 只拿头，不下载图片
    return response.ok; // 200 就是存在，404 就是不存在
  } catch (err) {
    return false;
  }
}

// 渲染背景图列表
async function renderBgList() {
  console.log('渲染背景图列表，自定义图片数量:', customImages.length);
  const grid = document.getElementById('bg-grid');
  
  let html = '';
  let i = 0;
  
  // 渲染默认图片
  for (i = 0; i < defaultBgImages.length; i++) {
    const img = defaultBgImages[i];
    const selected = currentBgImage === img.path ? 'selected' : '';
    const exists = await checkExtensionFileExists(chrome.runtime.getURL(img.path));
    console.log("exists", exists);
    if (!exists) continue; // 跳过不存在的图片
      
    html += `
      <div class="bg-card ${selected}" data-path="${img.path}">
        <div class="bg-preview" style="background-image: url('${chrome.runtime.getURL(img.path)}')"></div>
        <div class="bg-name">${img.name}</div>
      </div>
    `;
  }
  
  /*
  // 渲染自定义图片
  for (let i = 0; i < customImages.length; i++) {
    const img = customImages[i];
    const selected = currentBgImage === img.path ? 'selected' : '';
    html += `
      <div class="bg-card ${selected}" data-path="${img.path}">
        <div class="bg-preview" style="background-image: url('${img.dataUrl}')"></div>
        <div class="bg-name">
          ${img.name}
          <button class="delete-bg" data-path="${img.path}" title="删除">✕</button>
        </div>
      </div>
    `;
  }*/
  
  grid.innerHTML = html;
  
  // 绑定点击选择事件
  document.querySelectorAll('.bg-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-bg')) return;
      const path = card.dataset.path;
      console.log('选择图片，path:', path);
      selectBackground(path);
    });
  });
  
  // 绑定删除事件
  document.querySelectorAll('.delete-bg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      console.log('点击删除，path:', path);
      deleteCustomImage(path);
    });
  });
}

// 删除自定义图片
function deleteCustomImage(path) {
  console.log('删除图片:', path);
  console.log('删除前 customImages 数量:', customImages.length);
  
  // 从数组中移除
  const index = customImages.findIndex(img => img.path === path);
  if (index !== -1) {
    customImages.splice(index, 1);
    console.log('删除后 customImages 数量:', customImages.length);
  } else {
    console.log('未找到要删除的图片');
  }
  
  // 保存到 storage.local
  chrome.storage.local.set({ customImages: customImages }, () => {
    console.log('已保存到 storage.local');
    
    // 如果删除的是当前选中的图片
    if (currentBgImage === path) {
      const defaultFirst = defaultBgImages[0];
      currentBgImage = defaultFirst.path;
      
      chrome.storage.sync.set({ 
        bgImage: defaultFirst.path,
        bgImageDataUrl: null,
        bgOpacity: currentOpacity
      });
      
      updatePreview();
    }
    
    // 重新渲染列表
    renderBgList();
    showStatus('🗑️ 已删除背景图');
  });
}

// 选择背景图
// 选择背景图
function selectBackground(path) {
  console.log('selectBackground 被调用, path:', path);
  currentBgImage = path;
  
  // 更新选中样式
  document.querySelectorAll('.bg-card').forEach(card => {
    if (card.dataset.path === path) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // 如果开启跟随且该背景图有保存的透明度，切换到该透明度
  if (opacityMemoryEnabled && opacityMemoryMap[path]) {
    currentOpacity = opacityMemoryMap[path];
    // 更新滑块和显示值
    document.getElementById('opacity-slider').value = currentOpacity;
    document.getElementById('opacity-value').textContent = Math.round(currentOpacity * 100) + '%';
  }

  // 查找图片的 dataUrl
  const allImages = [...defaultBgImages, ...customImages];
  const selectedImg = allImages.find(img => img.path === path);
  
  if (selectedImg && selectedImg.dataUrl) {
    // 自定义图片：只保存 path 到 sync，dataUrl 已经在 storage.local 中
    chrome.storage.sync.set({ 
      bgImage: path,
      bgImageIsCustom: true,  // 标记是自定义图片
      bgOpacity: currentOpacity
    }, () => {
      console.log('已保存自定义图片标记到 sync, path:', path);
    });
  } else {
    // 默认图片
    chrome.storage.sync.set({ 
      bgImage: path,
      bgImageIsCustom: false,
      bgOpacity: currentOpacity
    }, () => {
      console.log('已保存默认图片到 sync, path:', path);
    });
  }
  
  updatePreview();
  showStatus('✅ 背景图已切换');
}
// 更新预览
function updatePreview() {
  const previewBox = document.getElementById('preview-box');
  if (!previewBox) return;
  
  const allImages = [...defaultBgImages, ...customImages];
  const currentImg = allImages.find(img => img.path === currentBgImage);
  
  if (currentImg) {
    const imgUrl = currentImg.dataUrl || chrome.runtime.getURL(currentImg.path);
    previewBox.style.backgroundImage = `url('${imgUrl}')`;
    previewBox.style.backgroundSize = 'cover';
    previewBox.style.backgroundPosition = 'center';
  }
  
  const previewContent = previewBox.querySelector('.preview-content');
  if (previewContent) {
    previewContent.style.backgroundColor = `rgba(255, 255, 255, ${currentOpacity})`;
  }
}

// 调整预览高度
function setupPreviewHeight() {
  const minusBtn = document.getElementById('preview-height-minus');
  const plusBtn = document.getElementById('preview-height-plus');
  const heightValue = document.getElementById('preview-height-value');
  const previewBox = document.getElementById('preview-box');
  
  if (minusBtn) {
    minusBtn.addEventListener('click', () => {
      previewHeight = Math.max(30, previewHeight - 5);
      previewBox.style.height = previewHeight + 'vh';
      heightValue.textContent = previewHeight + '%';
      chrome.storage.sync.set({ previewHeight: previewHeight });
      showStatus('📐 预览高度已调整');
    });
  }
  
  if (plusBtn) {
    plusBtn.addEventListener('click', () => {
      previewHeight = Math.min(100, previewHeight + 5);
      previewBox.style.height = previewHeight + 'vh';
      heightValue.textContent = previewHeight + '%';
      chrome.storage.sync.set({ previewHeight: previewHeight });
      showStatus('📐 预览高度已调整');
    });
  }
}

// 显示状态提示
let statusTimeout;
function showStatus(message) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.classList.add('show');
  
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    status.classList.remove('show');
  }, 1500);
}

// 处理图片上传
function setupUpload() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  
  if (!uploadArea) return;
  
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });
  
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.background = '#f1f5f9';
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.background = '';
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  });
}

// 处理图片上传
function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const timestamp = Date.now();
    const imageId = `custom_${timestamp}`;
    const imagePath = `custom://${imageId}`;
    
    const newImage = {
      name: file.name.replace(/\.[^/.]+$/, '').slice(0, 20),
      path: imagePath,
      dataUrl: dataUrl
    };
    
    customImages.push(newImage);
    
    chrome.storage.local.set({ customImages: customImages }, () => {
      renderBgList();
      showStatus('✅ 背景图已上传');
      // 上传后自动选中新图片
      selectBackground(imagePath);
    });
  };
  reader.readAsDataURL(file);
}

// 透明度调整
function setupOpacity() {
  const slider = document.getElementById('opacity-slider');
  const valueSpan = document.getElementById('opacity-value');
  
  if (!slider) return;
  
  slider.addEventListener('input', (e) => {
    currentOpacity = parseFloat(e.target.value);
    valueSpan.textContent = Math.round(currentOpacity * 100) + '%';
    updatePreview();
    chrome.storage.sync.set({ bgOpacity: currentOpacity });
    // 如果开启跟随，同步保存到当前背景图的透明度记录
    if (opacityMemoryEnabled) {
      saveOpacityToMemory(currentBgImage, currentOpacity);
    }
    showStatus('💾 透明度已保存');
  });
}

// 初始化
loadSettings();
setupUpload();
setupOpacity();
setupPreviewHeight();