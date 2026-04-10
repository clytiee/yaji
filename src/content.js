// content.js - 完整版，包含竖排文字、可编辑标题、纯净截图、题记格式、布局模式、行距调整
let html2canvasLoaded = false;
let html2canvasLoading = false;
let html2canvasQueue = [];

let isSelectionMode = false;
let savedSelectedText = '';
let savedSubtitleText = '';
let currentHighlightedElement = null;

let currentLineHeight = 1.5;

let horiAlign = 'center';

// ========== 1. 内嵌 html2canvas 精简版 ==========
(function() {
  if (typeof window.html2canvas !== 'undefined') return;
  window.html2canvas = function(element, options) {
    options = options || {};
    const scale = options.scale || 1;
    const backgroundColor = options.backgroundColor || '#ffffff';
    
    return new Promise((resolve, reject) => {
      try {
        const clone = element.cloneNode(true);
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;">${clone.outerHTML}</div></foreignObject></svg>`;
        
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width * scale, height * scale);
          resolve(canvas);
        };
        img.onerror = reject;
        img.src = 'data:image/svg+xml,' + encodeURIComponent(data);
      } catch (e) {
        reject(e);
      }
    });
  };
})();


// 创建高亮样式
const styleId = 'gufeng-highlight-style';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .fj-extractor-highlight {
      outline: 3px solid #3b82f6 !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
      transition: outline 0.1s ease !important;
      box-shadow: 0 0 0 2px rgba(59,130,246,0.3) !important;
      background-color: rgba(59,130,246,0.2) !important;
    }
  `;
  document.head.appendChild(style);
}

function clearHighlight() {
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('fj-extractor-highlight');
    currentHighlightedElement = null;
  }
}

function onMouseOver(event) {
  if (!isSelectionMode) return;
  
  let target = event.target;
  while (target && target !== document.body && target.tagName !== 'DIV') {
    target = target.parentElement;
  }
  if (!target || target === document.body) return;
  
  if (currentHighlightedElement === target) return;
  
  clearHighlight();
  currentHighlightedElement = target;
  currentHighlightedElement.classList.add('fj-extractor-highlight');
}

function onMouseOut(event) {
  if (!isSelectionMode) return;
  setTimeout(() => {
    if (currentHighlightedElement && !currentHighlightedElement.matches(':hover')) {
      clearHighlight();
    }
  }, 50);
}


function onClickHandler(event) {
  if (!isSelectionMode) return;
  
  // 获取目标 DIV
  let targetDiv = event.target;
  while (targetDiv && targetDiv !== document.body && targetDiv.tagName !== 'DIV') {
    targetDiv = targetDiv.parentElement;
  }
  if (!targetDiv || targetDiv === document.body) {
    showToast('⚠️ 请点击 DIV 元素', 1200);
    return;
  }
  
  event.preventDefault();
  event.stopPropagation();
  
  const extractedText = extractTextFromDiv(targetDiv);
  
  if (!extractedText || extractedText.trim() === '') {
    showToast('⚠️ 所选 div 内没有可提取的文字', 1500);
    return;
  }
  
  // 获取智能模式状态
  chrome.storage.sync.get(['smartMode'], (result) => {
    const smartMode = result.smartMode || false;
    let title = savedSelectedText;
    let subtitle = savedSubtitleText;
    
    if (smartMode) {
      // 智能模式：从提取的文字中解析第一行和第二行
      const lines = extractedText.split(/\n/).filter(line => line.trim() !== '');
      if (lines.length >= 2) {
        title = lines[0].trim();
        //超长的当作正文，而不是副标题
        if (lines[1].length <= 20) {
          subtitle = lines[1].trim();
        }
        // 正文去掉前两行
        const bodyText = lines.slice(2).join('\n');
        showA5FloatingPanel(bodyText, title, subtitle);
      } else if (lines.length === 1) {
        title = lines[0].trim();
        subtitle = '';
        showA5FloatingPanel('', title, subtitle);
      } else {
        showA5FloatingPanel(extractedText, title, subtitle);
      }
    } else {
      // 手动模式：使用用户选中的文字作为标题
      showA5FloatingPanel(extractedText, title, subtitle);
    }
  });
  
  cancelMode();
}

function extractTextFromDiv(divElement) {
  const clone = divElement.cloneNode(true);
  const scripts = clone.querySelectorAll('script, style, noscript, iframe');
  scripts.forEach(el => el.remove());
  
  let text = '';
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'section', 'article', 'blockquote'];
      if (blockTags.includes(tagName)) {
        if (text.length > 0 && !text.endsWith('\n')) text += '\n';
      }
      for (const child of node.childNodes) {
        traverse(child);
      }
      if (blockTags.includes(tagName)) {
        if (!text.endsWith('\n')) text += '\n';
      }
    }
  }
  traverse(clone);
  
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');

  // 【修改】只去除空格和制表符，保留换行
  text = text.replace(/[ \t]+/g, '');

  text = text.trim();

  //console.log("提取到的text:", text);
  
  return text;
}

// 打印图片函数 - 使用 Blob URL 方案（修复透明度）
async function printImage(panelElement, contentElement, titleValue) {
  try {
    // ========== 新增：读取保存的背景图和透明度 ==========
    const syncResult = await chrome.storage.sync.get(['bgImage', 'bgOpacity', 'bgImageIsCustom', 'plainMode']);
    console.log('syncResult:', syncResult);
    let bgImageUrl;
    let bgOpacity = syncResult.bgOpacity || 0.7;
    let plainMode = syncResult.plainMode || false;
    let savedBgImage = '';
    let savedBgOpacity = 0.7;

    if ( plainMode ) {
      console.log("无背景图模式");
    } else {
      if (syncResult.bgImageIsCustom && syncResult.bgImage) {
        // 自定义图片：从 storage.local 读取 DataURL
        const localResult = await chrome.storage.local.get(['customImages']);
        const customImages = localResult.customImages || [];
        console.log('customImages 列表:', customImages);
        console.log('要查找的 path:', syncResult.bgImage);

        const customImg = customImages.find(img => img.path === syncResult.bgImage);
        console.log('找到的图片:', customImg);

        if (customImg && customImg.dataUrl) {
          bgImageUrl = customImg.dataUrl;
          console.log('使用自定义背景图 (从 local 读取)');
        } else {
          // 找不到则回退到默认
          bgImageUrl = chrome.runtime.getURL('image/01.jpeg');
          console.log('自定义图片不存在，回退到默认');
        }
      } else {
        // 默认图片：使用扩展内路径
        const bgImage = syncResult.bgImage || 'image/01.jpeg';
        bgImageUrl = chrome.runtime.getURL(bgImage);
        console.log('使用默认背景图:', bgImageUrl);
      }

      savedBgImage = syncResult.bgImage || 'image/01.jpeg';
      savedBgOpacity = syncResult.bgOpacity || 0.7;

      console.log('读取保存的设置:', savedBgImage, savedBgOpacity);
      // ===================================================
    }

    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    
    let paperMargin;
    let sealPosition;
    let sealSize;
    let epiFontSize;
    let bodyPadding;
    let contentPadding;
    let vContentPadding;
    let contentMargin;
    let titleFontStyle;
    let subtitleFontStyle;
    let bgHeight;

    // 获取纸张大小和方向设置
    const paperSizeSelect = document.getElementById('fj-paper-size');
    paperSize = paperSizeSelect ? paperSizeSelect.value : 'A5';
    
    const orientationRadio = document.querySelector('input[name="layout-mode"]:checked');
    let orientation = orientationRadio ? orientationRadio.value : 'portrait';

    let panelWidth;
    if ( paperSize === 'mobile' ) {
      paperSize = '70mm 120mm';
      paperMargin = '2mm';
      sealPosition = 'bottom: 30px; left: 30px;'
      sealSize = 'width: 25px; height: 25px;';
      fontSize = '10pt;';
      lineHeight = '1';
      epiFontSize = '8pt;';
      bodyPadding = '8px;';
      contentPadding = '10px;';
      vContentHeight = '100mm;';
      vContentPadding = '5px;';
      contentMargin = '8px;';
      titleFontStyle = 'font-size: 10pt; font-weight: bold;';
      subtitleFontStyle = 'font-size: 8pt;';
      panelWidth = '375';
      bgHeight = '120mm;';
    } else {
      paperSize = orientation === 'portrait' ? 
        (paperSize === 'A5' ? 'A5 portrait' : 'A4 portrait') : 
        (paperSize === 'A5' ? 'A5 landscape' : 'A4 landscape');
      sealPosition = 'bottom: 50px; left: 50px;'
      paperMargin = '5mm';
      sealSize = 'width: 50px; height: 50px;';
      fontSize = '14pt';
      epiFontSize = '10pt;';
      lineHeight = currentLineHeight;
      bodyPadding = '12px;';
      contentPadding = '16px;';
      vContentPadding = '10px;';
      contentMargin = '20px;';
      titleFontStyle = 'font-size: 1rem; font-weight: bold;';
      subtitleFontStyle = 'font-size: 0.8rem;';
      panelWidth = panelElement.offsetWidth;
      if (paperSize === 'A5 portrait') {
        vContentHeight = '180mm;';
        bgHeight = '200mm;';
      } else if (paperSize === 'A5 landscape') {
        vContentHeight = '129mm;';
        bgHeight = '149mm';
      } else if (paperSize === 'A4 portrait') {
        vContentHeight = '267mm;';
        bgHeight = '287mm;';
      } else {
        vContentHeight = '180mm;';
        bgHeight = '200mm';
      }
    }
    console.log("paperSize:", paperSize, "fontSize:", fontSize);
    
    console.log("panelWidth:", panelWidth, "bgHeight:", bgHeight);
    //let bgImageUrl = chrome.runtime.getURL('image/01.jpeg');

    // 获取克隆的内容
    const contentClone = contentElement.cloneNode(true);
    
    if (!plainMode) {
      //bgImageUrl = chrome.runtime.getURL(savedBgImage);  // 用保存的背景图
      bgImageUrl = syncResult.bgImageDataUrl || chrome.runtime.getURL(syncResult.bgImage || 'image/01.jpeg');
      bgOpacity = savedBgOpacity;  // 用保存的透明度
      console.log("保存的背景图透明度：", savedBgOpacity);
    } else {
      bgImageUrl = '';
      bgOpacity = 1;
    }

    //背景
    const backgroundStyle = plainMode ? 'background-color: white;' : `background-image: url('${bgImageUrl}');'`;
    //文字区阴影
    const boxShadowStyle = plainMode ? 'box-shadow: none;' : 'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);';
    //印章
    const sealDisplay = plainMode ? 'display: none;' : 'display: block;';
    
    // 构建 HTML 内容
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(titleValue)} - 元素图文·雅集</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { height: 100%; }
    body {
      //border: solid 1px blue;
      margin: 0;
      //padding: ${bodyPadding}
      background: white;
      font-family: '方正金陵', 'FZJinL-B_GBJF', '华文楷书', 'KaiTi', '宋体', serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      //height: 100%;
      ${backgroundStyle}
      //background-position: top center;  /* 顶部居中 */
      //background-size: cover;
      background-position: center;
      background-repeat: repeat;
      background-attachment: fixed;
      background-clip: border-box;
      background-size: 100%;  /* 宽度100%，高度自动（可能被裁剪） */
    }
    .seal-stamp {
      ${sealDisplay}
      position: absolute;
      ${sealPosition}
      ${sealSize}
      opacity: 0.25;
      z-index: 10;
      pointer-events: none;
      background-image: url('${chrome.runtime.getURL('image/seal.png')}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }
    .opacity-controls {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 30px;
      padding: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    .opacity-controls button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: rgba(44, 62, 102, 0.7);
      color: white;
      font-size: 20px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .opacity-controls button:hover { background: #1e2a4a; transform: scale(1.05); }
    .opacity-value {
      text-align: center;
      font-size: 12px;
      color: #2c3e66;
      font-weight: bold;
      margin-top: 4px;
    }
    .print-content {
      //border: solid 1px red;
      max-width: ${panelWidth}px;
      width: 95%;
      background: rgba(255, 255, 255, ${bgOpacity});
      border-radius: 16px;
      padding: ${contentPadding}
      padding-top: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 0;
      align-items: center;
      margin: ${contentMargin}
      ${boxShadowStyle}
    }
    .vertical-content {
      //border: solid 1px green;
      display: flex;
      flex-direction: row-reverse;
      justify-content: center;
      align-items: flex-start;
      gap: 10px 0;
      min-height: auto;
      height: ${vContentHeight};
      line-height: ${currentLineHeight};
      padding: ${vContentPadding};
    }
    .vertical-paragraph {
      writing-mode: vertical-rl;
      text-orientation: upright;
      font-size: ${fontSize};
      margin: 0 0 0 7px;
      display: inline-block;
      vertical-align: top;
      padding-top: ${contentPadding};
    }
    .vertical-paragraph.epigraph { font-size: ${epiFontSize} !important; }
    .title { ${titleFontStyle} !important;}
    .subtitle { ${subtitleFontStyle} !important;}

    @media print {
      body, .vertical-paragraph {
        font-size: ${fontSize};
      }
      .vertical-content { justify-content: ${horiAlign}; }
      .opacity-controls { display: none !important; }
      @page { size: ${paperSize}; margin: ${paperMargin}; }
    }
  </style>
</head>
<body>
  <div class="seal-stamp"></div>
  <div class="opacity-controls">
    <button id="opacity-plus">+</button>
    <button id="opacity-minus">-</button>
    <div class="opacity-value" id="opacity-value-display">70%</div>
  </div>
  <div class="print-content" id="print-content">
    ${contentClone.innerHTML}
  </div>
  <script>
    (function() {
      var contentDiv = document.getElementById('print-content');
      var valueDisplay = document.getElementById('opacity-value-display');
      // 直接存储当前透明度值
      var currentOpacity = ${bgOpacity} || 0.7;
      
      function updateOpacity() {
        if (contentDiv) {
          // 直接设置内联样式，覆盖 CSS 类
          contentDiv.style.background = 'rgba(255, 255, 255, ' + currentOpacity + ')';
          console.log('设置透明度:', currentOpacity);
        }
        if (valueDisplay) {
          valueDisplay.textContent = Math.round(currentOpacity * 100) + '%';
        }
      }
      
      // 绑定按钮事件
      var plusBtn = document.getElementById('opacity-plus');
      var minusBtn = document.getElementById('opacity-minus');
      
      if (plusBtn) {
        plusBtn.onclick = function() {
          currentOpacity = Math.min(1.0, currentOpacity + 0.05);
          updateOpacity();
        };
      }
      
      if (minusBtn) {
        minusBtn.onclick = function() {
          currentOpacity = Math.max(0.3, currentOpacity - 0.05);
          updateOpacity();
        };
      }
      
      // 初始化
      updateOpacity();
    })();
  <\/script>
</body>
</html>`;
    
    // 创建 Blob URL 打开打印窗口
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          
          const handleFocus = () => {
            setTimeout(() => {
              //if (!printWindow.closed) printWindow.close();
            }, 100);
            printWindow.removeEventListener('focus', handleFocus);
          };
          printWindow.addEventListener('focus', handleFocus);
          
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }, 300);
      };
    } else {
      showToast('❌ 无法打开打印窗口', 1500);
    }
        
    window.scrollTo(originalScrollX, originalScrollY);
    showToast('🖨️ 打印窗口已打开', 1500);
  } catch (error) {
    console.error('打印失败:', error);
    showToast('❌ 打印失败', 1500);
  }
}

//下载图片函数
async function captureAndDownload(panelElement, contentElement, titleValue) {
  try {
        
    console.log("下载图片，获取宽度：", contentElement.offsetWidth);
    console.log("标题：", titleValue);

    let bgImage;
    let bgImageUrl;
    const syncResult = await chrome.storage.sync.get(['bgImage', 'bgOpacity', 'bgImageIsCustom', 'plainMode']);
    let plainMode = syncResult.plainMode || false;
    if ( plainMode ) {
      bgImage = '';
      bgImageUrl = '';
      console.log("无背景图模式");
    } else {
      bgImage = syncResult.bgImage || 'image/01.jpeg';
      bgImageUrl = chrome.runtime.getURL(bgImage);
      console.log('使用自带背景图:', bgImageUrl);
    }
    const bgOpacity = syncResult.bgOpacity || 0.7;
    console.log('读取背景图设置:', bgImage, bgOpacity, bgImageUrl);

    const bgStyle = plainMode === true ? 'background-color: white;' : `background-image: url('${bgImageUrl}');'`;

    const cloneContainer = document.createElement('div');
    cloneContainer.id = 'fj-clone-container';
    cloneContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      //width: ${contentElement.offsetWidth}px;
      min-width: 80mm;
      z-index: 9999;
      font-family: '方正金陵', 'FZJinL-B_GBJF', '华文楷书', 'KaiTi', '宋体', serif;
      background-size: cover;
      background-repeat: no-repeat;
      background-position: center;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 140mm;
      ${bgStyle}
    `;
    //console.log("cloneContainer.style.cssText:",cloneContainer.style.cssText);
    
    const contentClone = contentElement.cloneNode(true);
    contentClone.id = 'clone-content-area';
    contentClone.style.cssText = `
      display: block;
      padding: 20px 20px;
      background: rgba(255, 255, 255, ${bgOpacity});
      margin: 0;
      z-index: 9999;
      border-radius: 16px;
      min-width: 60mm;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    `;

    const title = contentClone.querySelector('#title');
    title.style.cssText += '; font-size: 1rem; font-weight: bold;';

    const subtitle = contentClone.querySelector('#subtitle');
    if (subtitle) subtitle.style.cssText += '; font-size: 0.8rem;';

    const cloneVerticalContent = contentClone.querySelector('.vertical-content');
    cloneVerticalContent.style.cssText += `; 
      min-height: 0; 
      max-height: 120mm; 
      line-height: 1.5; 
      padding-bottom: 0;
      //column-gap: 0.5em;
    `;

    const sealStamp = document.createElement('div');
    sealStamp.id = 'seal-stamp';
    sealStamp.style.cssText = `
      position: absolute;
      bottom: 45px; left: 45px;
      width: 32px; height: 32px;
      opacity: 0.25;
      z-index: 9999;
      pointer-events: none;
      background-image: url('${chrome.runtime.getURL('image/seal.png')}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    `;

    const originalContentArea = panelElement.querySelector('#content-area');
    const originalContentAreaDisplay = originalContentArea?.style.display;

    if (panelElement) panelElement.style.display = 'none';
    
    cloneContainer.appendChild(contentClone);
    cloneContainer.appendChild(sealStamp);
    document.body.appendChild(cloneContainer);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = cloneContainer.getBoundingClientRect();
    
    const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_PANEL' });
    
    if (response && response.success) {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        ctx.scale(devicePixelRatio, devicePixelRatio);

        console.log("scaleX:", scaleX, "scaleY:", scaleY, "devicePixelRatio:", devicePixelRatio);
        console.log("canvas:", canvas);
        console.log("rect:", rect);
        
        ctx.drawImage(
          img,
          rect.left * scaleX, rect.top * scaleY,
          rect.width * scaleX, rect.height * scaleY,
          0, 0, rect.width, rect.height
        );
        
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        let safeTitle = titleValue.replace(/[\\/:*?"<>|]/g, '-').trim();
        if (safeTitle.length > 30) safeTitle = safeTitle.substring(0, 30);
        if (!safeTitle) safeTitle = '无标题';
        
        link.download = `${safeTitle}-元素图文-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        
        cloneContainer.remove();

        if (panelElement) panelElement.style.display = 'block';

        //勾选时自动复制原文本
        const autoCopyCheckbox = document.getElementById('fj-auto-copy');
        if (autoCopyCheckbox.checked) {
          const copyOriginalTextBtn = document.getElementById('fj-copy-original');
          copyOriginalTextBtn.click();
        }
        
        const tempToast = document.createElement('div');
        tempToast.textContent = '✅ 图片已保存';
        tempToast.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #1e293b;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.8rem;
          z-index: 100;
          font-family: system-ui;
        `;
        document.body.appendChild(tempToast);
        setTimeout(() => tempToast.remove(), 1500);
      };
      img.src = response.dataUrl;
    } else {
      throw new Error('截图失败');
    }
  } catch (error) {
    console.error('截图失败:', error);
    const clone = document.getElementById('fj-clone-container');
    if (clone) clone.remove();
        
    const errorToast = document.createElement('div');
    errorToast.textContent = '❌ 截图失败';
    errorToast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #dc2626;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.8rem;
      z-index: 100;
      font-family: system-ui;
    `;
    document.body.appendChild(errorToast);
    setTimeout(() => errorToast.remove(), 1500);
  }
}

// 根据纸张大小计算每列最大字数
function getMaxCharsPerColumn(paperSize, panelWidth) {
  // 根据面板宽度估算每列可容纳字数
  // A5: 148mm, A4: 210mm
  // 每字约 14pt 宽度，1pt = 1/72 英寸，1英寸 = 25.4mm
  // 14pt ≈ 14/72 * 25.4 ≈ 4.94mm
  const charWidth = 5; // 约 5mm
  let widthInMM = 0;
  let maxChars;
  
  /*
  if (paperSize === 'A5') {
    widthInMM = 148; // A5 宽度 148mm
  } else if (paperSize === 'A4') {
    widthInMM = 210; // A4 宽度 210mm
  } else {
    widthInMM = 60; //手机 宽度 60mm
  }
  
  // 减去左右 padding (40mm) 和列间距
  const availableWidth = widthInMM - 40; // 减去边距
  const maxColumns = Math.floor(availableWidth / charWidth);
  */
  
  // 返回每列最大字数（A5约37字，A4约52字）
  //return paperSize === 'A5' ? 35 : 50;
  if (paperSize === 'A5') {
    maxChars = 35;
  } else if (paperSize === 'A4') {
    maxChars = 50;
  } else {
    maxChars = 29;
  }
  console.log("每列最大字数：", maxChars);
  return maxChars;
}

function getMaxColumnsPerPage(paperSize) {
  // 返回每页最大列数（A5约17，A4约34）
  //return paperSize === 'A5' ? 18 : 36;
  let maxCols;
  if (paperSize === 'A5') {
    maxCols = 18;
  } else if (paperSize === 'A4') {
    maxCols = 36;
  } else {
    maxCols = 9;
  }
  console.log("每页最大列数：", maxCols);
  return maxCols;
}

function showA5FloatingPanel(initialText, selectedTitle = '', selectedSubtitle = '') {
  // ========== 智能缓存逻辑 ==========
  // 检查是否与上次打开的内容相同
  const contentSignature = `${selectedTitle}|${selectedSubtitle}`;
  if (window.lastContentSignature === contentSignature) {
    // 相同内容：保留 window.editedText（之前编辑过的正文）
    console.log('[DEBUG] 相同内容，保留编辑缓存:', window.editedText?.substring(0, 50));
  } else {
    // 不同内容：清空编辑缓存
    window.editedText = null;
    window.lastContentSignature = contentSignature;
    console.log('[DEBUG] 内容已改变，清空编辑缓存');
  }
  // ========== 智能缓存逻辑结束 ==========

  // 纸张大小变量
  let currentPaperSize = 'A5'; // 默认 A5
  let maxCharsPerColumn = 37; // A5 默认每列 37 字

  const existingPanel = document.getElementById('fj-a5-panel');
  if (existingPanel) existingPanel.remove();
  
  let defaultTitle = selectedTitle;
  if (!defaultTitle) defaultTitle = '元素图文 · 雅集';
  if (defaultTitle.length > 50) defaultTitle = defaultTitle.substring(0, 50) + '...';
  
  let currentSubtitle = selectedSubtitle;
  let currentTitle = defaultTitle;
  let windowEditedText = null;

  let paperSize;
  
  const subtitleInput = document.createElement('input');
  subtitleInput.id = 'fj-subtitle-input';
  subtitleInput.type = 'text';
  subtitleInput.value = currentSubtitle;
  subtitleInput.placeholder = '朝代、作者（可选）';
  
  const overlay = document.createElement('div');
  overlay.id = 'fj-a5-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 999;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(3px);
    font-family: system-ui, sans-serif;
  `;
  
  const panel = document.createElement('div');
  panel.id = 'fj-a5-panel';
  panel.style.cssText = `
    width: 170mm;
    height: 220mm;
    max-width: 90vw;
    background: white;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    font-family: '方正金陵', 'FZJinL-B_GBJF', '华文楷书', 'KaiTi', '宋体', serif;
    font-weight: normal;
    line-height: 1.8;
    color: #1e293b;
    max-height: 88vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    position: relative;
    animation: fjSlideUp 0.25s ease-out;
    align-items: center;
  `;
  
  if (!document.getElementById('fj-anim-style')) {
    const styleAnim = document.createElement('style');
    styleAnim.id = 'fj-anim-style';
    styleAnim.textContent = `
      @keyframes fjSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      #fj-a5-panel::-webkit-scrollbar { width: 6px; }
      #fj-a5-panel::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 8px; }
      #fj-a5-panel::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
      #fj-a5-panel::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      
      .vertical-paragraph {
        writing-mode: vertical-rl;
        text-orientation: upright;
        font-size: 1.1rem;
        display: inline-block;
        vertical-align: top;
        transition: line-height 0.1s ease;
      }
      .vertical-paragraph.epigraph { font-size: 0.7rem !important; }
      .vertical-paragraph.compact { margin: 0 0; }
      
      .vertical-content {
        display: flex;
        flex-direction: row-reverse;
        justify-content: center;
        align-items: flex-start;
        gap: 10px 0;
        height: 120mm;
        padding-bottom: 10px;
      }
      .vertical-content::-webkit-scrollbar { height: 6px; }
      .vertical-content::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 8px; }
      .vertical-content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
      
      @media print {
        .fj-title-toolbar, .fj-epigraph-toolbar, .fj-layout-toolbar, .fj-lineheight-toolbar {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleAnim);
  }
  
  // 标题工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'fj-title-toolbar';
  toolbar.style.cssText = `
    padding: 14px 20px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fefefe;
    border-radius: 16px 16px 0 0;
    position: sticky;
    top: 0;
    background-color: white;
    z-index: 10;
  `;
  
  const titleContainer = document.createElement('div');
  titleContainer.style.cssText = `
    display: flex; 
    align-items: center; 
    gap: 10px; 
    flex: 1; 
    flex-wrap: wrap;`;
  
  const titleIcon = document.createElement('span');
  titleIcon.textContent = '📄';
  titleIcon.style.fontSize = '1.2rem';
  
  const titleInput = document.createElement('input');
  titleInput.id = 'fj-title-input';
  titleInput.type = 'text';
  titleInput.value = defaultTitle;
  titleInput.style.cssText = `
    font-size: 0.9rem;
    font-weight: 600;
    font-family: system-ui;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 6px 12px;
    background: #f8fafc;
    width: 285px;
  `;
  
  subtitleInput.style.cssText = `
    font-size: 0.8rem;
    font-weight: 400;
    font-family: system-ui;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 6px 12px;
    background: #f8fafc;
    color: #64748b;
    width: 185px;
  `;
  
  titleContainer.appendChild(titleIcon);
  titleContainer.appendChild(titleInput);
  titleContainer.appendChild(subtitleInput);
  
  const closeBtn = document.createElement('button');
  closeBtn.id = 'fj-close-panel';
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b; padding: 4px 10px;`;
  
  toolbar.appendChild(titleContainer);
  toolbar.appendChild(closeBtn);
  
  // 题记工具栏
  const epigraphToolbar = document.createElement('div');
  epigraphToolbar.className = 'fj-epigraph-toolbar';
  epigraphToolbar.style.cssText = `
    padding: 10px 20px;
    border-bottom: 1px solid #e2e8f0;
    background: #fef9e6;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-family: system-ui;
    flex-wrap: wrap;
    width: 93%;
  `;
  epigraphToolbar.innerHTML = `
    <span>📜 题记</span>
    <span>右第</span>
    <input id="fj-epigraph-start" type="number" min="0" value="0" style="width:30px; padding:4px 2px; border:1px solid #d1d5db; border-radius:6px; text-align:center;">
    <span> - </span>
    <input id="fj-epigraph-end" type="number" min="0" value="0" style="width:30px; padding:4px 2px; border:1px solid #d1d5db; border-radius:6px; text-align:center;">
    <span>列</span>
    <button id="fj-apply-epigraph" style="background:#b45309; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="应用题记设置">应用</button>

    <span style="margin-left: 5px;"></span>
    <button id="fj-epigraph-quick-1" style="background:#d97706; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="标题后1行">1</button>
    <button id="fj-epigraph-quick-2" style="background:#d97706; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="标题后2行">2</button>
    <button id="fj-epigraph-quick-3" style="background:#d97706; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="标题后3行">3</button>
    <button id="fj-epigraph-quick-4" style="background:#d97706; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="标题后4行">4</button>
    <button id="fj-epigraph-quick-5" style="background:#d97706; color:white; border:none; padding:4px 12px; border-radius:6px; cursor:pointer;" title="标题后5行">5</button>

    <button id="fj-clean-brackets" style="background:#fef9e6; color:white; border:none; padding:4px 4px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:2px; margin-left: 4px;" title="清理括号及其内容">
      <span style="font-size: 1.1rem;">🧽</span>
    </button>
 `;
  
  // 布局模式工具栏
  const layoutToolbar = document.createElement('div');
  layoutToolbar.className = 'fj-layout-toolbar';
  layoutToolbar.style.cssText = `
    padding: 8px 20px;
    border-bottom: 1px solid #e2e8f0;
    background: #f0f9ff;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    font-family: system-ui;
    width: 93%;
  `;
  let layoutMode = 'portrait';
  layoutToolbar.innerHTML = `
    <span>📄 纸张尺寸</span>
    <select id="fj-paper-size" style="padding:4px 4px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; cursor:pointer;">
        <option value="A5" selected>A5</option>
        <option value="A4">A4</option>
        <option value="mobile">手机</option>
    </select>
    <label style="display: flex; align-items: center; gap: 4px;">
      <input type="checkbox" id="fj-remember-paper-size"> 记住
    </label>

    <span style="padding-left: 10px;">方向</span>
    <label><input type="radio" name="layout-mode" value="portrait" checked> 竖向</label>
    <label><input type="radio" name="layout-mode" value="landscape"> 横向</label>

    <span style="padding-left: 5px";>📏 行距</span>
    <button id="fj-lineheight-minus" style="width:28px; height:28px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; cursor:pointer;">−</button>
    <span id="fj-lineheight-val" style="min-width:20px; text-align:center;">${currentLineHeight.toFixed(1)}</span>
    <button id="fj-lineheight-plus" style="width:28px; height:28px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; cursor:pointer;">+</button>
    <button id="fj-lineheight-reset" style="padding:4px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; cursor:pointer;">重置</button>

  `;
 
  // 内容区域
  const contentArea = document.createElement('div');
  contentArea.id = 'content-area';
  contentArea.style.cssText = `
    width: 148mm;
    height: 210mm;
    padding: 16px 16px;
    background: white;
    flex: 1;
    overflow-y: auto;
    min-height: 300px;`;
  
  // ========== 功能函数 ==========
  
  function updateLineHeight(value) {
    const allParagraphs = contentArea.querySelectorAll('.vertical-paragraph');
    allParagraphs.forEach(para => { para.style.lineHeight = value; });
    currentLineHeight = value;
    const valSpan = document.getElementById('fj-lineheight-val');
    if (valSpan) valSpan.textContent = value.toFixed(1);
  }
  
  function applyLayoutMode(mode) {
    const verticalContent = contentArea.querySelector('.vertical-content');
    if (!verticalContent) return;
    /*
    if (mode === 'portrait') {
      verticalContent.style.flexWrap = 'nowrap';
      verticalContent.style.overflowX = 'auto';
      verticalContent.style.overflowY = 'hidden';
    } else {
      verticalContent.style.flexWrap = 'wrap';
      verticalContent.style.overflowX = 'visible';
      verticalContent.style.overflowY = 'visible';
      verticalContent.style.minHeight = '250px';
    }
    */
    verticalContent.style.flexWrap = 'wrap';
    verticalContent.style.overflowX = 'visible';
    verticalContent.style.overflowY = 'visible';
    //verticalContent.style.minHeight = '250px';   
    layoutMode = mode;
  }
  
  function applyEpigraphFormat() {
    console.log('[DEBUG] ===== applyEpigraphFormat 按钮点击 =====');
    
    let startCol = parseInt(document.getElementById('fj-epigraph-start')?.value || '0', 10);
    let endCol = parseInt(document.getElementById('fj-epigraph-end')?.value || '0', 10);
    console.log('[DEBUG] 按钮读取值 - startCol:', startCol, 'endCol:', endCol);
    
    if (isNaN(startCol)) startCol = 0;
    if (isNaN(endCol)) endCol = 0;
    
    const verticalContentDiv = contentArea.querySelector('.vertical-content');
    if (!verticalContentDiv) {
      console.error('[ERROR] 未找到 .vertical-content 元素');
      showToast('❌ 未找到内容区域', 1500);
      return;
    }
    
    const allParagraphs = verticalContentDiv.querySelectorAll('.vertical-paragraph');
    const currentCount = allParagraphs.length;
    console.log('[DEBUG] 当前共有列数:', currentCount);
    
    allParagraphs.forEach(para => para.classList.remove('epigraph'));
    
    if (startCol <= 0 || endCol <= 0 || startCol > endCol) {
      console.log('[DEBUG] 清除题记范围');
      showToast('📜 题记范围已清除', 1200);
      return;
    }
    
    let startIndex = startCol - 1;
    let endIndex = endCol - 1;
    
    if (startIndex < 0 || startIndex >= allParagraphs.length) {
      console.warn(`起始列 ${startCol} 超出范围（共 ${allParagraphs.length} 列）`);
      showToast(`⚠️ 列范围超出（共 ${allParagraphs.length} 列）`, 1500);
      return;
    }
    if (endIndex < 0 || endIndex >= allParagraphs.length) {
      console.warn(`结束列 ${endCol} 超出范围（共 ${allParagraphs.length} 列）`);
      showToast(`⚠️ 列范围超出（共 ${allParagraphs.length} 列）`, 1500);
      return;
    }
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (allParagraphs[i]) {
        allParagraphs[i].classList.add('epigraph');
        console.log(`[DEBUG] ✅ 段落 ${i} 已添加 epigraph 类`);
      }
    }
    
    const finalCount = verticalContentDiv.querySelectorAll('.vertical-paragraph.epigraph').length;
    console.log(`[DEBUG] 最终添加了 ${finalCount} 个 epigraph`);
    //showToast(`📜 已应用题记：从右起第 ${startCol} 至 ${endCol} 列`, 1500);
  }
  
  function updateEpigraphFormat() {
    console.log('[DEBUG] ===== updateEpigraphFormat 开始执行 =====');
    
    let startCol = parseInt(document.getElementById('fj-epigraph-start')?.value || '0', 10);
    let endCol = parseInt(document.getElementById('fj-epigraph-end')?.value || '0', 10);
    console.log('[DEBUG] 原始输入值 - startCol:', startCol, 'endCol:', endCol);
    
    if (isNaN(startCol)) startCol = 0;
    if (isNaN(endCol)) endCol = 0;
    console.log('[DEBUG] 解析后值 - startCol:', startCol, 'endCol:', endCol);
    
    // 获取正确的垂直内容容器
    const verticalContentDiv = contentArea.querySelector('.vertical-content');
    console.log('[DEBUG] .vertical-content 元素:', verticalContentDiv);
    
    if (!verticalContentDiv) {
      console.error('[ERROR] 未找到 .vertical-content 元素！');
      return;
    }
    
    const allParagraphs = verticalContentDiv.querySelectorAll('.vertical-paragraph');
    console.log('[DEBUG] 找到 .vertical-paragraph 数量:', allParagraphs.length);
    
    // 打印每个段落的前10个字符用于调试
    allParagraphs.forEach((para, idx) => {
      const text = para.innerText || para.textContent;
      console.log(`[DEBUG] 段落 ${idx}: 内容预览="${text.substring(0, 20)}..."`);
    });
    
    // 先清除所有 epigraph 类
    allParagraphs.forEach(para => {
      if (para.classList.contains('epigraph')) {
        console.log('[DEBUG] 清除段落的 epigraph 类');
      }
      para.classList.remove('epigraph');
    });
    
    // 如果范围无效，直接返回
    if (startCol <= 0 || endCol <= 0) {
      console.log('[DEBUG] 范围无效 (startCol<=0 或 endCol<=0)，退出');
      return;
    }
    
    if (startCol > endCol) {
      console.log('[DEBUG] 起始列大于结束列，退出');
      return;
    }
    
    const startIndex = startCol - 1;
    const endIndex = endCol - 1;
    console.log('[DEBUG] 计算的索引范围 - startIndex:', startIndex, 'endIndex:', endIndex);
    
    // 检查范围是否有效
    if (startIndex < 0 || startIndex >= allParagraphs.length) {
      console.warn(`[WARN] 起始列 ${startCol} 超出范围（共 ${allParagraphs.length} 列）`);
      showToast(`⚠️ 起始列超出范围（共 ${allParagraphs.length} 列）`, 1500);
      return;
    }
    if (endIndex < 0 || endIndex >= allParagraphs.length) {
      console.warn(`[WARN] 结束列 ${endCol} 超出范围（共 ${allParagraphs.length} 列）`);
      showToast(`⚠️ 结束列超出范围（共 ${allParagraphs.length} 列）`, 1500);
      return;
    }
    
    // 应用题记样式
    console.log(`[DEBUG] 开始应用题记样式，范围: ${startIndex} 到 ${endIndex}`);
    for (let i = startIndex; i <= endIndex; i++) {
      if (allParagraphs[i]) {
        allParagraphs[i].classList.add('epigraph');
        console.log(`[DEBUG] ✅ 段落 ${i} 已添加 epigraph 类`);
      } else {
        console.warn(`[WARN] 段落 ${i} 不存在`);
      }
    }
    
    // 验证结果
    const epigraphCount = verticalContentDiv.querySelectorAll('.vertical-paragraph.epigraph').length;
    console.log(`[DEBUG] 应用题记完成，共 ${epigraphCount} 个段落获得了 epigraph 类`);
    
    if (epigraphCount === 0 && startCol > 0 && endCol > 0) {
      console.error('[ERROR] 应用题记失败，但没有抛出错误！');
    }
    
    console.log('[DEBUG] ===== updateEpigraphFormat 执行完毕 =====');
  }
  
  //拼接标题和副标题，正文按每列最多字拆分成多列，自动调整行距
  function renderVerticalContent(sourceText) {
    console.log('[DEBUG] renderVerticalContent 开始执行, sourceText 长度:', sourceText?.length);
    
    const titleText = titleInput.value || '无标题';
    const subtitleText = subtitleInput.value || '';
    console.log('[DEBUG] 标题:', titleText, '副标题:', subtitleText);
    
    let titleHtml = '';
    if (subtitleText && subtitleText.trim() !== '') {
      titleHtml = `<div class="vertical-paragraph title" id="title">
        ${escapeHtml(titleText)}&emsp;<span class="subtitle" id="subtitle">${escapeHtml(subtitleText.trim())}</span>
      </div>`;
    } else {
      titleHtml = `<div class="vertical-paragraph title" id="title">${escapeHtml(titleText)}</div>`;
    }
    
    //const paragraphs = sourceText.split(/\n+/);
    const paragraphs = sourceText.split(/\n/);
    let contentHtml = '';
    let totalColumns = 0;
    let columnCount = 0;

    // 获取纸张大小和方向设置
    const paperSizeSelect = document.getElementById('fj-paper-size');
    const paperSize = paperSizeSelect ? paperSizeSelect.value : 'A5';
    
    // 获取每列最大字数
    const maxChars = getMaxCharsPerColumn(currentPaperSize);
    console.log("[DEBUG] maxChars: ", maxChars);
    
    for (let para of paragraphs) {
      //console.log('[DEBUG] para:', para);
      //if (para.trim() === '') continue;
      //if (para === '') continue;
      //const chars = para.trim().split('');
      const chars = para.split('');
      //console.log('[DEBUG] chars:', chars, 'length:', chars.length);
      //const maxChars = 37;
      if (para === '') {
          columnCount = 1;
          contentHtml += `<div class="vertical-paragraph"></div>`;
      }else {
          columnCount = Math.ceil(chars.length / maxChars);
          contentHtml += `<div class="vertical-paragraph">${escapeHtml(chars.join(''))}</div>`;
      }
      totalColumns += columnCount;
    }
    const totalCount = 1 + totalColumns;
    console.log('[DEBUG] 总列数:', totalCount, '内容列数:', totalColumns);
    // 当前总列数赋值给全局变量
    currentColumnCount = totalCount;

    contentArea.innerHTML = `<div class="vertical-content">${titleHtml}${contentHtml}</div>`;
    //console.log('[DEBUG] DOM 已更新, innerHTML 长度:', contentArea.innerHTML.length);
    
    // 应用当前行距
    /*
    let allParagraphs = contentArea.querySelectorAll('.vertical-paragraph');
    console.log('[DEBUG] 找到 .vertical-paragraph 数量:', allParagraphs.length);
    allParagraphs.forEach(para => {
      para.style.lineHeight = currentLineHeight;
    });

    // 超过8列时，自动把行距调整为1；超过4列时，调整为1.5；否则调整为2
    let targetLineHeight = currentLineHeight;
    if (totalCount > 8) {
      targetLineHeight = 1.0;
      if (currentLineHeight !== 1.0) {
        //showToast(`共 ${totalCount} 列，已自动调整为紧凑行距 1.0`, 1500);
      }
    } else if (totalCount > 4){
        targetLineHeight = 1.5;
        if (currentLineHeight !== 1.5) {
          //showToast(`共 ${totalCount} 列，已自动调整为中等行距 1.5`, 1500);
      }
      else {
          targetLineHeight = 2;
      }
    }
    if (paperSize === 'mobile') targetLineHeight = 1;
    console.log("自动调整行距为：", targetLineHeight);
    
    allParagraphs.forEach(para => {
      para.style.lineHeight = targetLineHeight;
    });
    
    currentLineHeight = targetLineHeight;
    */

    const valSpan = document.getElementById('fj-lineheight-val');
    if (valSpan) valSpan.textContent = currentLineHeight.toFixed(1);
    
    // 应用布局模式
    applyLayoutMode(layoutMode);
    
    // 紧凑模式
    if (layoutMode === 'landscape' && totalCount > 10) {
      allParagraphs.forEach(para => para.classList.add('compact'));
    } else if (layoutMode === 'landscape') {
      allParagraphs.forEach(para => para.classList.remove('compact'));
    }
  }

  /**
   * 清理正文中的括号及其内容
   */
  function cleanBracketsAndContent() {
    let currentText = windowEditedText || initialText;
    
    if (!currentText || currentText.trim() === '') {
      showToast('⚠️ 没有可清理的内容', 1500);
      return;
    }
    
    const originalLength = currentText.length;
    
    // 定义括号匹配规则
    const bracketPairs = [
      { open: '(', close: ')' },
      { open: '（', close: '）' },
      { open: '[', close: ']' },
      { open: '【', close: '】' },
      { open: '{', close: '}' },
      { open: '｛', close: '｝' }
    ];
    
    let cleanedText = currentText;
    let removedCount = 0;
    
    bracketPairs.forEach(pair => {
      const openEscaped = pair.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const closeEscaped = pair.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${openEscaped}[^${openEscaped}${closeEscaped}]*${closeEscaped}`, 'g');
      
      const matches = cleanedText.match(regex);
      if (matches) {
        removedCount += matches.length;
      }
      
      cleanedText = cleanedText.replace(regex, '');
    });
    
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n/g, '\n\n');
    cleanedText = cleanedText.replace(/[ \t]+/g, '');
    cleanedText = cleanedText.trim();
    
    if (cleanedText === currentText) {
      showToast('📝 未找到括号内容', 1500);
      return;
    }
    
    const removedChars = originalLength - cleanedText.length;
    
    // 更新编辑后的文本
    editedText = cleanedText;
    
    // 重新渲染
    renderVerticalContent(cleanedText);
    
    showToast(`🧽 已清理 ${removedCount} 处括号，移除 ${removedChars} 个字符`, 2000);
  }
  
  // 编辑功能
  let isEditing = false;
  let originalContent = '';
  let origianlContentWidth = '148mm';
  
  function enterEditMode() {
    if (isEditing) return;

    // 禁用副标题输入框
    subtitleInput.disabled = true;
    titleInput.disabled = true;
    subtitleInput.style.opacity = '0.5';
    titleInput.style.opacity = '0.5';

    isEditing = true;
    originalContent = contentArea.innerHTML;
    
    const verticalContentDiv = contentArea.querySelector('.vertical-content');
    let editText = '';

    if (verticalContentDiv) {
      const allParagraphs = verticalContentDiv.querySelectorAll('.vertical-paragraph');
      let startIndex = 0;
      for (let i = 0; i < allParagraphs.length; i++) {
        if (allParagraphs[i].classList.contains('title') || 
          allParagraphs[i].classList.contains('subtitle')) {
          startIndex = i + 1;
        } else {
          break;
        }
      }

      for (let i = startIndex; i < allParagraphs.length; i++) {
        let text = allParagraphs[i].innerText || allParagraphs[i].textContent;
        // 不跳过空列，而是添加空行标记
        if (text && text.trim()) {
          editText += text.trim();
        }
        // 每列后都添加换行（包括空列）
        editText += '\n';
      }
      //editText = editText.trim();
      // 移除最后一个多余的换行
      editText = editText.replace(/\n$/, '');
    } else {
      editText = windowEditedText || initialText;
    }

    if (!editText) editText = windowEditedText || initialText;
    
    origianlContentWidth = contentArea.style.width;
    contentArea.style.width = '148mm';
    console.log("contentArea:", contentArea, "编辑前的内容宽度：", origianlContentWidth);

    const textarea = document.createElement('textarea');
    textarea.value = editText;
    textarea.style.cssText = `width:92%; min-height:270px; padding:12px; font-family:monospace; border:2px solid #3b82f6; border-radius:12px; resize:vertical;`;
    
    const editToolbar = document.createElement('div');
    editToolbar.style.cssText = `display:flex; justify-content:space-between; margin-bottom:12px; padding:8px 12px; background:#f1f5f9; border-radius:8px;`;
    editToolbar.innerHTML = `<span>✏️ 编辑模式 - 每行一个竖排块</span>
      <div><button id="fj-save-edit" style="background:#3b82f6;color:white;border:none;padding:4px 12px;border-radius:6px;">✅ 保存</button>
      <button id="fj-cancel-edit" style="background:#94a3b8;color:white;border:none;padding:4px 12px;border-radius:6px;">❌ 取消</button></div>`;
    
    contentArea.innerHTML = '';
    contentArea.appendChild(editToolbar);
    contentArea.appendChild(textarea);
    textarea.focus();
    
    document.getElementById('fj-save-edit').onclick = () => saveEditContent(textarea.value);
    document.getElementById('fj-cancel-edit').onclick = () => cancelEdit();
    textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') saveEditContent(textarea.value);
      if (e.key === 'Escape') cancelEdit();
    });
  }
  
  function saveEditContent(newText) {
    if (!newText || newText.trim() === '') {
      showToast('⚠️ 内容不能为空', 1500);
      return;
    }
    window.editedText = newText;
    renderVerticalContent(newText);
    isEditing = false;
    showToast('✅ 内容已更新', 1500);

    // 恢复副标题输入框
    subtitleInput.disabled = false;
    titleInput.disabled = false;
    subtitleInput.style.opacity = '1';
    titleInput.style.opacity = '1';

    contentArea.style.width = origianlContentWidth;
  }
  
  function cancelEdit() {
    contentArea.innerHTML = originalContent;
    isEditing = false;
    showToast('📝 已取消编辑', 1200);
    contentArea.style.width = origianlContentWidth;
  }

  panel.appendChild(toolbar);
  panel.appendChild(epigraphToolbar);
  panel.appendChild(layoutToolbar);
  panel.appendChild(contentArea);
    
  // 绑定事件
  titleInput.addEventListener('input', () => renderVerticalContent(window.editedText || initialText));
  subtitleInput.addEventListener('input', () => renderVerticalContent(window.editedText || initialText));
  contentArea.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) enterEditMode(); });
  
  const portraitRadio = layoutToolbar.querySelector('input[value="portrait"]');
  const landscapeRadio = layoutToolbar.querySelector('input[value="landscape"]');
  portraitRadio.addEventListener('change', () => { if (portraitRadio.checked) applyLayoutMode('portrait'); });
  landscapeRadio.addEventListener('change', () => { if (landscapeRadio.checked) applyLayoutMode('landscape'); });
  
  document.getElementById('fj-apply-epigraph')?.addEventListener('click', applyEpigraphFormat);
  const startInput = document.getElementById('fj-epigraph-start');
  const endInput = document.getElementById('fj-epigraph-end');
  if (startInput) startInput.addEventListener('input', updateEpigraphFormat);
  if (endInput) endInput.addEventListener('input', updateEpigraphFormat);
  
  const minusBtn = document.getElementById('fj-lineheight-minus');
  const plusBtn = document.getElementById('fj-lineheight-plus');
  const resetBtn = document.getElementById('fj-lineheight-reset');
  if (minusBtn) minusBtn.onclick = () => updateLineHeight(Math.max(1.0, currentLineHeight - 0.1));
  if (plusBtn) plusBtn.onclick = () => updateLineHeight(Math.min(3.0, currentLineHeight + 0.1));
  if (resetBtn) resetBtn.onclick = () => updateLineHeight(2.0);
  
  // 底部按钮栏
  const footer = document.createElement('div');
  footer.className = 'fj-footer';
  footer.style.cssText = `
    padding: 12px 20px;
    border-top: 1px solid #eef2ff;
    font-size: 0.75rem;
    color: #64748b;
    text-align: center;
    font-family: system-ui;
    background: #fafcff;
    border-radius: 0 0 16px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 93%;
  `;
  footer.innerHTML = `
    <span>✍️ 方正金陵 · 竖排版</span>
    <div style="display: flex; gap: 8px; align-items: center;">
      <input type="checkbox" id="fj-with-tag" style="width:10px; cursor: point; margin: 0;"></input><label title="复制时末尾带#标签">签</label>
      <input type="checkbox" id="fj-auto-copy" style="width:10px; cursor: point; margin: 0;"></input><label title="下载图片自动复制原文本">复</label>
      <button id="fj-copy-original" style="background:#f1f5f9; border:none; padding:6px 10px; border-radius:20px; cursor:pointer;" title="复制原文本">📄</button>
      <button id="fj-copy-text" style="background:#f1f5f9; border:none; padding:6px 14px; border-radius:20px; cursor:pointer;" title="复制编辑后文本">📋</button>
      <input type="checkbox" id="fj-auto-close" style="width:10px; cursor: point; margin: 0;"></input><label title="打印/下载后自动关闭">关</label>
      <button id="fj-print-image" style="background:#2c3e66; border:none; padding:6px 14px; border-radius:20px; cursor:pointer; color:white; width: 98px;" title="默认为A5尺寸，无页眉页脚">🖨️ 打印</button>
      <button id="fj-download-image" style="background:#2c3e66; border:none; padding:6px 14px; border-radius:20px; cursor:pointer; color:white;">📸 下载图片</button>
    </div>
  `;
  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // 读取保存的自动关闭设置
  let autoCloseCheckbox = document.getElementById('fj-auto-close');
  console.log("读取保存的自动关闭设置：", autoCloseCheckbox.checked);
  chrome.storage.sync.get(['autoCloseAfterAction'], (result) => {
    if (autoCloseCheckbox) {
      autoCloseCheckbox.checked = result.autoCloseAfterAction || false;
    }
  });

  //读取保存的复制带标签设置
  let withTagCheckbox = document.getElementById('fj-with-tag');
  chrome.storage.sync.get(['copyWithTag'], (result) => {
    if (withTagCheckbox) {
      withTagCheckbox.checked = result.copyWithTag || false;
    }
  });

  //读取保存的自动复制设置
  let autoCopyCheckbox = document.getElementById('fj-auto-copy');
  chrome.storage.sync.get(['autoCopy'], (result) => {
    if (autoCopyCheckbox) {
      autoCopyCheckbox.checked = result.autoCopy || false;
    }
  });

  // 保存自动关闭设置
  autoCloseCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoCloseAfterAction: e.target.checked });
  });

  // 保存复制带标签设置
  withTagCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ copyWithTag: e.target.checked });
  });  

  // 保存自动复制设置
  autoCopyCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoCopy: e.target.checked });
  });  

  // ========== 纸张尺寸记忆功能 ==========
  const paperSizeSelect = document.getElementById('fj-paper-size');
  const rememberPaperSizeCheckbox = document.getElementById('fj-remember-paper-size');

  // 读取保存的纸张尺寸和记忆状态
  chrome.storage.sync.get(['rememberPaperSize', 'savedPaperSize'], (result) => {
    if (result.rememberPaperSize && result.savedPaperSize && paperSizeSelect) {
      paperSizeSelect.value = result.savedPaperSize;
      // 触发 change 事件以应用尺寸
      paperSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      showToast(`已恢复纸张尺寸: ${result.savedPaperSize}`, 1000);
    }
    if (rememberPaperSizeCheckbox) {
      rememberPaperSizeCheckbox.checked = result.rememberPaperSize || false;
    }
  });

  // 监听纸张尺寸变化
  if (paperSizeSelect) {
    paperSizeSelect.addEventListener('change', (e) => {
      const selectedSize = e.target.value;
      currentPaperSize = selectedSize;
      showToast(`纸张大小已切换为 ${selectedSize}`, 1000);
      
      // 调整内容区域大小
      const contentArea = document.getElementById('content-area');
      if (contentArea) {
        if (selectedSize === 'A5') {
          contentArea.style.width = '148mm';
          contentArea.style.height = '210mm';
        } else if (selectedSize === 'A4') {
          contentArea.style.width = '210mm';
          contentArea.style.height = '297mm';
        } else if (selectedSize === 'mobile') {
          contentArea.style.width = '70mm';
          contentArea.style.height = '120mm';
        }
      }
      
      // 如果勾选了"记住"，则保存设置
      if (rememberPaperSizeCheckbox && rememberPaperSizeCheckbox.checked) {
        chrome.storage.sync.set({ 
          rememberPaperSize: true,
          savedPaperSize: selectedSize
        });
      }
      
      // 重新渲染内容
      const currentText = window.editedText || initialText;
      renderVerticalContent(currentText);
    });
  }

  // 监听"记住"复选框变化
  if (rememberPaperSizeCheckbox) {
    rememberPaperSizeCheckbox.addEventListener('change', (e) => {
      if (!e.target.checked) {
        // 取消记住时，清除保存的设置
        chrome.storage.sync.set({ 
          rememberPaperSize: false,
          savedPaperSize: null
        });
      } else {
        // 勾选时，立即保存当前选择的纸张尺寸
        const currentSize = paperSizeSelect ? paperSizeSelect.value : 'A5';
        chrome.storage.sync.set({ 
          rememberPaperSize: true,
          savedPaperSize: currentSize
        });
        showToast('已记住纸张尺寸', 1000);
      }
    });
  }
  // ========== 纸张尺寸记忆功能结束 ==========

  // 初始化渲染
  renderVerticalContent(initialText);
  
  // 绑定页面上的按钮事件
  setTimeout(() => {
    // 行距按钮
    const minusBtn = document.getElementById('fj-lineheight-minus');
    const plusBtn = document.getElementById('fj-lineheight-plus');
    const resetBtn = document.getElementById('fj-lineheight-reset');

    // 题记按钮
    const applyBtn = document.getElementById('fj-apply-epigraph');
    const quick1 = document.getElementById('fj-epigraph-quick-1');
    const quick2 = document.getElementById('fj-epigraph-quick-2');
    const quick3 = document.getElementById('fj-epigraph-quick-3');
    const quick4 = document.getElementById('fj-epigraph-quick-4');
    const quick5 = document.getElementById('fj-epigraph-quick-5');
    const epigraphReset = document.getElementById('fj-epigraph-reset');

    // 题记按钮
    // 快捷按钮1：2-2列
    if (quick1) {
      quick1.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '2';
          endInput.value = '2';
          // 触发 input 事件更新样式预览
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          // 调用应用函数执行实际重排
          applyEpigraphFormat();
          //showToast('📜 已设置题记范围：第2列', 1200);
        }
      });
    }
    
    // 快捷按钮2：2-3列
    if (quick2) {
      quick2.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '2';
          endInput.value = '3';
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          applyEpigraphFormat();
          //showToast('📜 已设置题记范围：标题后2列', 1200);
        }
      });
    }
    
    // 快捷按钮3：2-4列
    if (quick3) {
      quick3.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '2';
          endInput.value = '4';
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          applyEpigraphFormat();
          //showToast('📜 已设置题记范围：标题后3列', 1200);
        }
      });
    }

    // 快捷按钮4：2-5列
    if (quick4) {
      quick4.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '2';
          endInput.value = '5';
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          applyEpigraphFormat();
          //showToast('📜 已设置题记范围：标题后4列', 1200);
        }
      });
    }

    // 快捷按钮5：2-6列
    if (quick5) {
      quick5.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '2';
          endInput.value = '6';
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          applyEpigraphFormat();
          //showToast('📜 已设置题记范围：标题后5列', 1200);
        }
      });
    }

    // 重置按钮：清除题记范围
    if (epigraphReset) {
      epigraphReset.addEventListener('click', () => {
        const startInput = document.getElementById('fj-epigraph-start');
        const endInput = document.getElementById('fj-epigraph-end');
        if (startInput && endInput) {
          startInput.value = '0';
          endInput.value = '0';
          startInput.dispatchEvent(new Event('input', { bubbles: true }));
          endInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          // 清除所有 epigraph 样式
          const verticalContentDiv = contentArea.querySelector('.vertical-content');
          if (verticalContentDiv) {
            const allParagraphs = verticalContentDiv.querySelectorAll('.vertical-paragraph');
            allParagraphs.forEach(para => {
              para.classList.remove('epigraph');
            });
          }
          showToast('已清除题记范围', 1000);
        }
      });
    }
    
    // 行距按钮
    if (applyBtn) {
      //console.log('[DEBUG] 成功找到按钮，绑定事件');
      applyBtn.addEventListener('click', applyEpigraphFormat);
    } else {
      console.error('[ERROR] 仍然找不到行距按钮！');
    }
    if (minusBtn) {
      minusBtn.onclick = () => {
        let newVal = Math.max(1.0, currentLineHeight - 0.1);
        const allParagraphs = contentArea.querySelectorAll('.vertical-paragraph');
        allParagraphs.forEach(para => { para.style.lineHeight = newVal; });
        currentLineHeight = newVal;
        const valSpan = document.getElementById('fj-lineheight-val');
        if (valSpan) valSpan.textContent = newVal.toFixed(1);
        showToast(`行距调整为 ${newVal.toFixed(1)}`, 1000);
      };
    }
    if (plusBtn) {
      plusBtn.onclick = () => {
        let newVal = Math.min(3.0, currentLineHeight + 0.1);
        const allParagraphs = contentArea.querySelectorAll('.vertical-paragraph');
        allParagraphs.forEach(para => { para.style.lineHeight = newVal; });
        currentLineHeight = newVal;
        const valSpan = document.getElementById('fj-lineheight-val');
        if (valSpan) valSpan.textContent = newVal.toFixed(1);
        showToast(`行距调整为 ${newVal.toFixed(1)}`, 1000);
      };
    }
    if (resetBtn) {
      resetBtn.onclick = () => {
        const allParagraphs = contentArea.querySelectorAll('.vertical-paragraph');
        allParagraphs.forEach(para => { para.style.lineHeight = 2.0; });
        currentLineHeight = 2.0;
        const valSpan = document.getElementById('fj-lineheight-val');
        if (valSpan) valSpan.textContent = '2.0';
        showToast(`行距已重置为 2.0`, 1000);
      };
    }
    // 纸张大小选择
    const paperSizeSelect = document.getElementById('fj-paper-size');
    if (paperSizeSelect) {
      paperSizeSelect.addEventListener('change', (e) => {
        currentPaperSize = e.target.value;
        showToast(`纸张大小已切换为 ${currentPaperSize}`, 1000);
        
        // 如果是 A5，调整内容区域大小为 148x210mm
        const contentArea = document.getElementById('content-area');
        if (contentArea) {
          if (currentPaperSize === 'A5') {
            contentArea.style.width = '148mm';
            contentArea.style.height = '210mm';
          } else if (currentPaperSize === 'A4') {
            contentArea.style.width = '210mm';
            contentArea.style.height = '297mm';
          } else if (currentPaperSize === 'mobile') {
            contentArea.style.width = '70mm';
            contentArea.style.height = '120mm';
          }
        }
        console.log("[DEBUG] 调整内容区域大小: ", contentArea.style.width, contentArea.style.height);
        // ✅ 关键：重新渲染内容，应用新的每列字数
        const currentText = window.editedText || initialText;
        renderVerticalContent(currentText);
      });
    }
    // 清理括号及内容
    const cleanBracketsBtn = document.getElementById('fj-clean-brackets');
    if (cleanBracketsBtn) {
      cleanBracketsBtn.addEventListener('click', () => {
        cleanBracketsAndContent();
      });
    }
  }, 100);

  // 关闭和复制功能
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  panel.addEventListener('wheel', (e) => e.stopPropagation());
  
  // 监听复制原文本事件
  document.getElementById('fj-copy-original')?.addEventListener('click', async () => {
    const titleValue = titleInput.value + ' ' + subtitleInput.value;
    let copyText = titleValue + '\n' + initialText;
    const withTagCheckbox = document.getElementById('fj-with-tag');
    if (withTagCheckbox.checked) {
      copyText += "\n#诗词 #国学 #古风 #国风 #中国文化";
    }
    try { await navigator.clipboard.writeText(copyText); showToast('✅ 文本已复制', 1500); } 
    catch { showToast('❌ 复制失败', 1500); }
  });

  // 监听复制文本事件
  document.getElementById('fj-copy-text')?.addEventListener('click', async () => {
    const contentArea = document.getElementById('content-area');
    try { await navigator.clipboard.writeText(contentArea.innerText || initialText); showToast('✅ 文本已复制', 1500); } 
    catch { showToast('❌ 复制失败', 1500); }
  });

  // 监听打印图片事件
  document.getElementById('fj-print-image')?.addEventListener('click', async () => {
    const titleValue = titleInput.value + ' ' + subtitleInput.value;
  
    // 在打印前获取并保存自动关闭状态
    let checkbox = document.getElementById('fj-auto-close');
    const shouldAutoClose = checkbox ? checkbox.checked : false;

    checkbox = document.getElementById('fj-with-tag');
    const shouldWithTag = checkbox ? checkbox.checked : false;
    
    console.log('[DEBUG] 打印 - 重新获取的 checkbox 状态:', shouldAutoClose, shouldWithTag);

    await printImage(panel, contentArea, titleValue);

    // 检查是否需要自动关闭
    if (shouldAutoClose) {
      console.log('[DEBUG] 将自动关闭面板');
      // 延迟关闭，确保打印对话框已打开
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          console.log('[DEBUG] 执行自动关闭');
          overlay.remove();
        }
      }, 1000);
    }
  });

  // 监听下载图片事件
  document.getElementById('fj-download-image')?.addEventListener('click', async () => {
    const titleValue = titleInput.value + ' ' + subtitleInput.value;

    const checkbox = document.getElementById('fj-auto-close');
    const shouldAutoClose = checkbox ? checkbox.checked : false;
    
    console.log('[DEBUG] 打印 - 重新获取的 checkbox 状态:', shouldAutoClose);
    console.log('[DEBUG] 打印 - checkbox 元素:', checkbox);

    await captureAndDownload(panel, contentArea, titleValue);

    // 检查是否需要自动关闭
    const autoCloseCheckbox = document.getElementById('fj-auto-close');
    if (shouldAutoClose) {
      console.log('[DEBUG] 将自动关闭面板');
      // 延迟关闭，确保打印对话框已打开
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          console.log('[DEBUG] 执行自动关闭');
          overlay.remove();
        }
      }, 1000);
    }
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function showToast(msg, duration = 2000) {

  const result = await chrome.storage.sync.get(['silentMode']);
  const silentMode = result.silentMode || false;

  console.log('[DEBUG] silentMode:', silentMode);
  if (silentMode) return;

  console.log('[DEBUG] showToast:', msg);
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed; bottom:0; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:8px 20px; border-radius:40px; font-size:0.85rem; z-index:10000000; animation:fadeInOut 2s ease;`;
  if (!document.getElementById('toast-anim')) {
    const animStyle = document.createElement('style');
    animStyle.id = 'toast-anim';
    animStyle.textContent = `@keyframes fadeInOut {0%{opacity:0;transform:translateX(-50%) translateY(20px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-20px)}}`;
    document.head.appendChild(animStyle);
  }
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}


function activateMode() {
  console.log('[DEBUG] ===== 进入 activateMode =====, isSelectionMode:', isSelectionMode);
  if (isSelectionMode) return;

  // 保存当前选中的文字
  const selection = window.getSelection();
  savedSelectedText = selection ? selection.toString().trim() : '';

  // 处理多行选中的文字
  if (savedSelectedText) {
    const lines = savedSelectedText.split(/\r?\n/);
    if (lines.length >= 2) {
      // 第一行作为标题，第二行作为副标题
      savedSelectedText = lines[0].trim();
      savedSubtitleText = lines[1].trim();
      // 如果有更多行，可以作为额外的内容，这里暂时不处理
      console.log('[Content] 检测到多行选中，标题:', savedSelectedText, '副标题:', savedSubtitleText);
    } else {
      savedSelectedText = savedSelectedText;
      savedSubtitleText = '';
    }
  } else {
    savedSelectedText = '';
    savedSubtitleText = '';
  }

  console.log('[Content] 进入选择模式，保存选中文字:', savedSelectedText);
  console.log('[Content] 副标题:', savedSubtitleText);
  
  chrome.storage.sync.get(['smartMode'], (result) => {
    const smartMode = result.smartMode || false;
    console.log('[DEBUG] smartMode:', smartMode);
    
    // 智能模式下，不需要预先设置标题/副标题
    // 等到点击 DIV 时再从内容中解析
    
    isSelectionMode = true;
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('click', onClickHandler, true);
    document.addEventListener('keydown', onKeyDown);
    
    const modeHint = smartMode ? ' 智能选择：点击 DIV 自动识别副标题' : ' 手动选择：先选中副标题文字，再点击 DIV';
    showToast(`🎯 进入选择模式，${modeHint}，按 ESC 退出`, 2000);
  });
}

function onKeyDown(event) { if (event.key === 'Escape') cancelMode(); }

function cancelMode() {
  if (!isSelectionMode) return;
  isSelectionMode = false;
  document.removeEventListener('mouseover', onMouseOver);
  document.removeEventListener('mouseout', onMouseOut);
  document.removeEventListener('click', onClickHandler, true);
  document.removeEventListener('keydown', onKeyDown);
  clearHighlight();
  //showToast('🔴 选择模式已关闭', 1200);
}

/*
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ACTIVATE_MODE') { activateMode(); sendResponse({ success: true }); }
  else if (request.action === 'CANCEL_MODE') { cancelMode(); sendResponse({ success: true }); }
  return true;
});
*/

window.addEventListener('beforeunload', () => { if (isSelectionMode) cancelMode(); });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ACTIVATE_MODE') { 
    activateMode(); 
    sendResponse({ success: true }); 
  }
  else if (request.action === 'CANCEL_MODE') { 
    cancelMode(); 
    sendResponse({ success: true }); 
  }
  else if (request.action === 'SHOW_TOAST') { 
    showToast(request.message, 1500); 
    sendResponse({ success: true }); 
  }
  return true;
});

