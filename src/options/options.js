// 默认背景图列表
const defaultBgImages = [
  { name: '1', file: 'image/01.jpeg', path: 'image/01.jpeg' },
  { name: '2', file: 'image/02.jpeg', path: 'image/02.jpeg' },
  { name: '3', file: 'image/03.jpeg', path: 'image/03.jpeg' },
  { name: '4', file: 'image/04.jpeg', path: 'image/04.jpeg' },
  { name: '5', file: 'image/05.jpeg', path: 'image/05.jpeg' },
  { name: '6', file: 'image/06.jpeg', path: 'image/06.jpeg' },
  { name: '7', file: 'image/07.jpeg', path: 'image/07.jpeg' },
  { name: '8', file: 'image/08.jpeg', path: 'image/08.jpeg' },
  { name: '9', file: 'image/09.jpeg', path: 'image/09.jpeg' },
  { name: '10', file: 'image/10.jpeg', path: 'image/10.jpeg' },
  { name: '11', file: 'image/11.jpeg', path: 'image/11.jpeg' },
  { name: '12', file: 'image/12.jpeg', path: 'image/12.jpeg' },
  { name: '13', file: 'image/13.jpeg', path: 'image/13.jpeg' },
];

let currentBgImage = '';
let currentOpacity = 0.7;
let customImages = []; // 用户上传的自定义图片

// 加载保存的设置
function loadSettings() {
  chrome.storage.sync.get(['bgImage', 'bgOpacity', 'customImages'], (result) => {
    currentBgImage = result.bgImage || defaultBgImages[0].path;
    currentOpacity = result.bgOpacity || 0.7;
    customImages = result.customImages || [];
    
    // 更新 UI
    document.getElementById('opacity-slider').value = currentOpacity;
    document.getElementById('opacity-value').textContent = Math.round(currentOpacity * 100) + '%';
    
    // 渲染背景图列表
    renderBgList();
    
    // 更新预览
    updatePreview();
  });
}

// 渲染背景图列表
function renderBgList() {
  const grid = document.getElementById('bg-grid');
  const allImages = [...defaultBgImages, ...customImages];
  
  grid.innerHTML = allImages.map(img => `
    <div class="bg-card ${currentBgImage === img.path ? 'selected' : ''}" data-path="${img.path}">
      <div class="bg-preview" style="background-image: url('${chrome.runtime.getURL(img.path)}')"></div>
      <div class="bg-name">${img.name}</div>
    </div>
  `).join('');
  
  // 绑定点击事件
  document.querySelectorAll('.bg-card').forEach(card => {
    card.addEventListener('click', () => {
      const path = card.dataset.path;
      selectBackground(path);
    });
  });
}

// 选择背景图
function selectBackground(path) {
  currentBgImage = path;
  
  // 更新选中样式
  document.querySelectorAll('.bg-card').forEach(card => {
    if (card.dataset.path === path) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  // 保存
  saveSettings();
  updatePreview();
  chrome.storage.sync.set({ bgImage: currentBgImage });  // ← 保存
  showStatus('✅ 背景图已切换');
}

// 更新预览
function updatePreview() {
  const previewBox = document.getElementById('preview-box');
  if (currentBgImage) {
    previewBox.style.backgroundImage = `url('${chrome.runtime.getURL(currentBgImage)}')`;
    previewBox.style.backgroundSize = 'cover';
    previewBox.style.backgroundPosition = 'center';
  }
  
  const previewContent = previewBox.querySelector('.preview-content');
  if (previewContent) {
    previewContent.style.backgroundColor = `rgba(255, 255, 255, ${currentOpacity})`;
  }
}

// 保存设置
function saveSettings() {
  chrome.storage.sync.set({
    bgImage: currentBgImage,
    bgOpacity: currentOpacity,
    customImages: customImages
  });
}

// 显示状态提示
let statusTimeout;
function showStatus(message) {
  const status = document.getElementById('status');
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
  
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });
  
  // 拖拽上传
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

// 处理图片上传并保存到扩展
function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    
    // 生成唯一文件名
    const timestamp = Date.now();
    const filename = `custom_${timestamp}.png`;
    const imagePath = `custom/${filename}`;
    
    // 保存到 chrome.storage.local（因为图片可能比较大）
    chrome.storage.local.set({ [imagePath]: imageData }, () => {
      // 添加到自定义列表
      customImages.push({
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 20),
        path: imagePath,
        file: filename
      });
      
      saveSettings();
      renderBgList();
      showStatus('✅ 背景图已上传');
    });
  };
  reader.readAsDataURL(file);
}

// 透明度调整
function setupOpacity() {
  const slider = document.getElementById('opacity-slider');
  const valueSpan = document.getElementById('opacity-value');
  
  slider.addEventListener('input', (e) => {
    currentOpacity = parseFloat(e.target.value);
    valueSpan.textContent = Math.round(currentOpacity * 100) + '%';
    updatePreview();
    saveSettings();
    chrome.storage.sync.set({ bgOpacity: currentOpacity });  // ← 保存
    showStatus('💾 透明度已保存');
  });
}

// 初始化
loadSettings();
setupUpload();
setupOpacity();