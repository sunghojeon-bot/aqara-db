// public/app.js
let allProducts = [];
let activeProduct = null;
let isGlobalEditMode = false;
let editingSectionId = null;
let currentReplacingFigure = null;

// Keep track of accordion collapse state for each category
const collapsedCategories = {};

const DOM = {
  searchInput: document.getElementById('searchInput'),
  sidebarContent: document.getElementById('sidebarContent'),
  articleContainer: document.getElementById('articleContainer'),
  tocContainer: document.getElementById('tocContainer'),
  scrollWrap: document.getElementById('articleScrollWrap'),
  editModeBtn: document.getElementById('editModeBtn'),
  buildBtn: document.getElementById('buildBtn'),
  deployBtn: document.getElementById('deployBtn'),
  editorToolbar: document.getElementById('editorToolbar'),
  tableModal: document.getElementById('tableModal'),
  tableRows: document.getElementById('tableRows'),
  tableCols: document.getElementById('tableCols')
};

const isStandalone = (!window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1') && window.location.protocol === 'file:') || !!document.getElementById('source-data');

window.onload = async () => {
  setupSearch();
  setupScrollSpy();
  setupImageLightbox();
  await loadDatabase();
};

function setupImageLightbox() {
  document.addEventListener('click', (e) => {
    // Zoom image if clicked outside edit mode
    const img = e.target.closest('.figure-media img');
    if (img) {
      const isEditing = img.closest('.editable-active');
      if (!isEditing) {
        openLightbox(img.src);
      }
    }
  });

  // Lightbox Image click handler for zooming
  const lightboxImg = document.getElementById('lightboxImage');
  const lightboxModal = document.getElementById('lightboxModal');
  if (lightboxImg && lightboxModal) {
    lightboxImg.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent modal close
      lightboxImg.classList.toggle('zoomed');
      if (lightboxImg.classList.contains('zoomed')) {
        lightboxModal.classList.add('scroll-mode');
      } else {
        lightboxModal.classList.remove('scroll-mode');
      }
    });
  }
}

async function loadDatabase() {
  const hasInjectedData = !!document.getElementById('source-data');

  if (isStandalone || hasInjectedData) {
    console.log("Running in Static Data mode");
    if (DOM.editModeBtn) DOM.editModeBtn.style.display = 'none';
    if (DOM.buildBtn) DOM.buildBtn.style.display = 'none';
    if (DOM.deployBtn) DOM.deployBtn.style.display = 'none';
    loadStandaloneData();
  } else {
    console.log("Running in Local Server mode");
    if (DOM.deployBtn) DOM.deployBtn.style.display = 'inline-block';
    try {
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error("Failed to fetch products");
      allProducts = await response.json();
      renderSidebar();
    } catch (err) {
      console.error(err);
      loadStandaloneData(); // fallback
    }
  }
}

function loadStandaloneData() {
  const scriptElem = document.getElementById('source-data');
  if (scriptElem) {
    try {
      const dbData = JSON.parse(scriptElem.textContent);
      allProducts = dbData.articles;
      
      // Merge browser localStorage edits if any
      allProducts.forEach((p, idx) => {
        const localSaved = localStorage.getItem(`prod_edit_${p.id}`);
        if (localSaved) {
          try {
            allProducts[idx] = JSON.parse(localSaved);
          } catch(e) {
            console.error("Failed to parse localStorage item", e);
          }
        }
      });
      
      renderSidebar();
    } catch (err) {
      console.error("Failed to parse source-data", err);
      DOM.sidebarContent.innerHTML = '<div class="empty-state"><p>데이터를 로드하지 못했습니다.</p></div>';
    }
  } else {
    DOM.sidebarContent.innerHTML = '<div class="empty-state"><p>데이터가 없는 빈 템플릿입니다.</p></div>';
  }
}

function renderSidebar(filteredProducts = null) {
  const products = filteredProducts || allProducts;
  if (products.length === 0) {
    DOM.sidebarContent.innerHTML = '<div class="empty-state"><p>검색 결과가 없습니다.</p></div>';
    return;
  }

  // Group products by category
  const groups = {};
  products.forEach(p => {
    const catName = p.category.replace(/^\d+_/,'');
    if (!groups[catName]) groups[catName] = [];
    groups[catName].push(p);
  });

  let html = '';
  Object.keys(groups).sort().forEach(catName => {
    // Accordion default collapsed state: true (collapsed)
    if (collapsedCategories[catName] === undefined) {
      collapsedCategories[catName] = true;
    }
    const isCollapsed = collapsedCategories[catName];
    const count = groups[catName].length;

    html += `
      <div class="sidebar-group ${isCollapsed ? 'collapsed' : ''}" id="group-${catName}">
        <div class="sidebar-category" onclick="toggleSidebarCategory('${catName.replace(/'/g, "\\'")}')">
          <span class="category-title">${catName}</span>
          <span class="category-count">${count}</span>
          <svg class="category-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="sidebar-list">
    `;
    
    groups[catName].sort((a,b) => a.product_name.localeCompare(b.product_name)).forEach(p => {
      const isActive = activeProduct && activeProduct.id === p.id;
      html += `
        <div class="sidebar-item ${isActive ? 'active' : ''}" onclick="selectProduct('${p.id}')">
          <div class="prod-name">${p.product_name}</div>
        </div>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });

  DOM.sidebarContent.innerHTML = html;
}

window.toggleSidebarCategory = function(catName) {
  collapsedCategories[catName] = !collapsedCategories[catName];
  renderSidebar();
};

function setupSearch() {
  DOM.searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderSidebar();
      return;
    }
    
    const filtered = allProducts.filter(p => {
      const nameMatch = p.product_name.toLowerCase().includes(q);
      const categoryMatch = p.category.toLowerCase().includes(q);
      const modelMatch = p.models.some(m => m.toLowerCase().includes(q));
      const tagMatch = p.tags.some(t => t.toLowerCase().includes(q));
      return nameMatch || categoryMatch || modelMatch || tagMatch;
    });
    
    // Automatically expand categories that contain results
    filtered.forEach(p => {
      const catName = p.category.replace(/^\d+_/,'');
      collapsedCategories[catName] = false; // Expand
    });
    
    renderSidebar(filtered);
  });
}

async function selectProduct(productId) {
  if (editingSectionId) {
    if (!confirm("작성 중인 편집 내용이 저장되지 않을 수 있습니다. 계속하시겠습니까?")) {
      return;
    }
    editingSectionId = null;
    DOM.editorToolbar.style.display = 'none';
  }

  // Force expand the category of the selected product
  const selectedProd = allProducts.find(p => p.id === productId);
  if (selectedProd) {
    const catName = selectedProd.category.replace(/^\d+_/,'');
    collapsedCategories[catName] = false; // expand parent category
  }

  if (isStandalone) {
    activeProduct = selectedProd;
    renderProductDetail();
  } else {
    try {
      DOM.articleContainer.innerHTML = '<div class="loading-spinner"></div>';
      const response = await fetch(`/api/products/${productId}`);
      if (!response.ok) throw new Error("Failed to load product details");
      activeProduct = await response.json();
      renderProductDetail();
    } catch (err) {
      console.error(err);
      DOM.articleContainer.innerHTML = '<div class="empty-state"><p>제품 정보를 불러오지 못했습니다.</p></div>';
    }
  }

  renderSidebar(); // re-render to highlight active item
}

function renderProductDetail() {
  if (!activeProduct) return;

  const catName = activeProduct.category.replace(/^\d+_/,'');
  
  let html = `
    <div class="product-title-section">
      ${isGlobalEditMode ? `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; width: 100%;">
          <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">카테고리 (분류)</label>
          <input type="text" id="edit-product-category" class="edit-input" value="${activeProduct.category}" style="width: 100%; max-width: 400px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--panel-border); font-family: inherit; font-size: 0.9rem;" />
          
          <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-top: 8px;">제품명 (제목)</label>
          <input type="text" id="edit-product-name" class="edit-input" value="${activeProduct.product_name}" style="width: 100%; max-width: 600px; padding: 10px 16px; border-radius: var(--radius-sm); border: 1px solid var(--panel-border); font-family: inherit; font-size: 1.5rem; font-weight: 800;" />
        </div>
      ` : `
        <span class="product-category-tag">${catName}</span>
        <h1 class="product-title">${activeProduct.product_name}</h1>
        <button class="btn" onclick="downloadAsWordDoc()" style="margin-top: 12px; font-size: 0.82rem; font-weight:600; background: #2b579a; border-color: #2b579a; color: #fff; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--radius-sm); cursor: pointer;">
          <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          워드 파일(.doc) 다운로드
        </button>
      `}
  `;

  // Attachments Rendering / Editor
  const attachments = activeProduct.attachments || [];
  if (isGlobalEditMode) {
    html += `
      <div class="attachments-editor-card" style="margin-top: 16px; padding: 16px; border-radius: var(--radius-md); background: rgba(2, 132, 199, 0.03); border: 1px dashed var(--accent-border); width: 100%;">
        <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--accent); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          📎 첨부 파일 편집
        </h3>
        <div id="attachments-edit-container" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; width: 100%;">
          ${attachments.map((att, idx) => `
            <div class="attachment-edit-row" data-index="${idx}" style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <input type="text" class="att-name-input" value="${att.name}" placeholder="파일 이름" style="flex: 2; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--panel-border); font-size: 0.85rem;" />
              <input type="text" class="att-url-input" value="${att.url}" placeholder="URL 링크 또는 업로드된 경로" style="flex: 4; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--panel-border); font-size: 0.85rem;" />
              <button class="btn" type="button" onclick="uploadAttachmentFile(${idx})" style="padding: 6px 10px; font-size: 0.8rem; background: #64748b; color: #fff; border-color: #64748b; font-weight: 600;">
                📤 업로드
              </button>
              <button class="btn" type="button" onclick="removeAttachmentRow(${idx})" style="padding: 6px 10px; font-size: 0.8rem; background: var(--danger); border-color: var(--danger); color: #fff; font-weight: 600;">
                ❌ 삭제
              </button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-edit" type="button" onclick="addAttachmentRow()" style="padding: 6px 12px; font-size: 0.8rem; border-color: var(--accent-border); color: var(--accent); background: var(--accent-soft);">
          ➕ 첨부파일 추가
        </button>
        <input type="file" id="attachment-file-uploader" style="display: none;" onchange="handleAttachmentFileUpload(event)" />
      </div>
    `;
  } else {
    if (attachments.length > 0) {
      html += `
        <div class="product-attachments-container" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; width: 100%;">
          ${attachments.map(att => `
            <a href="${att.url}" target="_blank" class="attachment-badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(2, 132, 199, 0.06); border: 1px solid rgba(2, 132, 199, 0.15); color: #0284c7; padding: 8px 14px; border-radius: 20px; text-decoration: none; font-weight: 600; font-size: 0.82rem; transition: all 0.2s ease;">
              <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              ${att.name}
            </a>
          `).join('')}
        </div>
      `;
    }
  }

  // 동적 첨부파일 긁어모으기 및 노출 (오직 이 제품에 속한 첨부파일들만 수집)
  const productFiles = extractAllProductFiles(activeProduct);
  const totalProductFiles = productFiles.length;

  if (!isGlobalEditMode && totalProductFiles > 0) {
    html += `
      <div class="detail-attachments-summary-card">
        <div class="detail-attachments-title">
          <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          📎 이 제품의 첨부파일 및 매뉴얼 (총 ${totalProductFiles}개)
        </div>
        <div class="detail-attachments-grid" style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
          ${productFiles.map(file => `
            <a href="${file.url}" target="_blank" class="detail-attachment-badge" title="${file.name}">
              <svg style="width: 12px; height: 12px; opacity:0.7;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              ${file.name}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`; // Close product-title-section

  // Standard 6-Section Layout
  const sections = [
    { id: 'sec-spec', title: '1. 제품 사양', content: activeProduct.specifications || '<p>등록된 정보가 없습니다.</p>' },
    { id: 'sec-features', title: '2. 주요 특징', content: activeProduct.features || '<p>등록된 정보가 없습니다.</p>' },
    { 
      id: 'sec-precheck', 
      title: '3. 설치전 확인사항', 
      content: `
        <h3>1) 주의사항, 경고 등</h3>
        <div id="sub-precheck-content">${activeProduct.pre_installation || '<p>등록된 정보가 없습니다.</p>'}</div>
      `
    },
    { id: 'sec-install', title: '4. 설치 방법', content: activeProduct.installation || '<p>등록된 정보가 없습니다.</p>' },
    {
      id: 'sec-integration',
      title: '5. 앱 연동 방법',
      content: `
        ${activeProduct.integration?.overview_table ? `<div class="integration-overview-table" style="margin-bottom: 20px;">${activeProduct.integration.overview_table}</div>` : ''}
        ${activeProduct.integration?.overview_text ? `<div class="integration-overview-text" style="margin-top: 12px; margin-bottom: 20px;">${activeProduct.integration.overview_text}</div>` : ''}
        <h3>1) 아카라홈</h3>
        <div class="integration-sub-content" id="sub-int-aqara">${activeProduct.integration?.aqara_home || '<p>등록된 정보가 없습니다.</p>'}</div>
        <h3>2) 애플홈</h3>
        <div class="integration-sub-content" id="sub-int-apple">${activeProduct.integration?.apple_home || '<p>등록된 정보가 없습니다.</p>'}</div>
        <h3>3) 스마트씽스</h3>
        <div class="integration-sub-content" id="sub-int-smartthings">${activeProduct.integration?.smartthings || '<p>등록된 정보가 없습니다.</p>'}</div>
        ${activeProduct.integration?.others ? `<h3>4) 기타 연동</h3><div class="integration-sub-content" id="sub-int-others">${activeProduct.integration.others}</div>` : ''}
      `
    },
    { id: 'sec-qna', title: '6. 자주 묻는 질문 (Q&A)', content: activeProduct.qna || '<p>등록된 정보가 없습니다.</p>' }
  ];

  sections.forEach(sec => {
    html += `
      <section class="section-card" id="${sec.id}">
        <div class="section-card-header">
          <h2>${sec.title}</h2>
          ${isGlobalEditMode ? `<button class="btn btn-section-edit" onclick="toggleSectionEdit('${sec.id}')">✏️ 편집</button>` : ''}
        </div>
        <div class="section-card-content" id="${sec.id}-content">
          ${sec.content}
        </div>
      </section>
    `;
  });

  DOM.articleContainer.innerHTML = html;
  renderTOC(sections);
}

function renderTOC(sections) {
  DOM.tocContainer.style.display = 'block';
  let html = `
    <div class="toc-title">목차</div>
    <div class="toc-list">
  `;
  
  sections.forEach(sec => {
    html += `<a class="toc-item" onclick="scrollToSection('${sec.id}')" data-section="${sec.id}">${sec.title}</a>`;
  });
  
  html += `</div>`;
  DOM.tocContainer.innerHTML = html;
}

function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupScrollSpy() {
  DOM.scrollWrap.addEventListener('scroll', () => {
    const sections = ['sec-spec', 'sec-features', 'sec-precheck', 'sec-install', 'sec-integration', 'sec-qna'];
    let activeId = sections[0];
    const topOffset = DOM.scrollWrap.getBoundingClientRect().top;

    for (const secId of sections) {
      const el = document.getElementById(secId);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= topOffset + 140) {
          activeId = secId;
        } else {
          break;
        }
      }
    }

    document.querySelectorAll('.toc-item').forEach(item => {
      if (item.dataset.section === activeId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  });
}

// Global Edit Mode Toggle
function toggleGlobalEditMode() {
  isGlobalEditMode = !isGlobalEditMode;
  
  if (isGlobalEditMode) {
    DOM.editModeBtn.textContent = '✅ 편집 모드 종료';
    DOM.editModeBtn.classList.add('btn-primary');
    alert("제품명, 카테고리, 첨부파일 및 각 섹션을 편집할 수 있습니다.");
  } else {
    DOM.editModeBtn.textContent = '✏️ 편집 모드 시작';
    DOM.editModeBtn.classList.remove('btn-primary');
    
    // Save Title, Category, and Attachments
    const nameInput = document.getElementById('edit-product-name');
    const catInput = document.getElementById('edit-product-category');
    if (nameInput && catInput && activeProduct) {
      syncAttachmentsFromUI();
      
      const newName = nameInput.value.trim();
      const newCat = catInput.value.trim();
      
      const categoryChanged = activeProduct.category !== newCat;
      const nameChanged = activeProduct.product_name !== newName;
      
      activeProduct.product_name = newName;
      activeProduct.category = newCat;
      
      saveProductData().then(() => {
        if (categoryChanged || nameChanged) {
          loadDatabase();
        }
      });
    }
    
    if (editingSectionId) {
      toggleSectionEdit(editingSectionId);
    }
  }
  
  if (activeProduct) {
    renderProductDetail();
  }
}

// Section-level Inline Edit
async function toggleSectionEdit(sectionId) {
  const contentDiv = document.getElementById(`${sectionId}-content`);
  if (!contentDiv) return;

  if (editingSectionId === sectionId) {
    editingSectionId = null;
    contentDiv.contentEditable = "false";
    contentDiv.classList.remove('editable-active');
    DOM.editorToolbar.style.display = 'none';

    // Clean up temporary edit mode buttons and attributes before saving
    const tempDelBtns = contentDiv.querySelectorAll('.img-delete-btn');
    tempDelBtns.forEach(btn => btn.remove());
    
    const figures = contentDiv.querySelectorAll('.figure');
    figures.forEach(fig => {
      const media = fig.querySelector('.figure-media');
      if (media) {
        media.removeAttribute('onclick');
      }
      const plc = fig.querySelector('.placeholder-content');
      if (plc) {
        plc.removeAttribute('onclick');
      }
    });

    if (sectionId === 'sec-spec') {
      activeProduct.specifications = contentDiv.innerHTML.trim();
    } else if (sectionId === 'sec-features') {
      activeProduct.features = contentDiv.innerHTML.trim();
    } else if (sectionId === 'sec-precheck') {
      const sub = document.getElementById('sub-precheck-content');
      activeProduct.pre_installation = sub ? sub.innerHTML.trim() : contentDiv.innerHTML.trim();
    } else if (sectionId === 'sec-install') {
      activeProduct.installation = contentDiv.innerHTML.trim();
    } else if (sectionId === 'sec-integration') {
      const aq = document.getElementById('sub-int-aqara');
      const ap = document.getElementById('sub-int-apple');
      const st = document.getElementById('sub-int-smartthings');
      const ot = document.getElementById('sub-int-others');
      
      activeProduct.integration = {
        aqara_home: aq ? aq.innerHTML.trim() : '',
        apple_home: ap ? ap.innerHTML.trim() : '',
        smartthings: st ? st.innerHTML.trim() : '',
        others: ot ? ot.innerHTML.trim() : ''
      };
    } else if (sectionId === 'sec-qna') {
      activeProduct.qna = contentDiv.innerHTML.trim();
    }

    await saveProductData();
    renderProductDetail();
  } else {
    if (editingSectionId) {
      await toggleSectionEdit(editingSectionId);
    }
    
    editingSectionId = sectionId;
    contentDiv.contentEditable = "true";
    contentDiv.classList.add('editable-active');
    contentDiv.focus();
    
    // Dynamically inject delete buttons and replace triggers to all figures
    const figures = contentDiv.querySelectorAll('.figure');
    figures.forEach(fig => {
      if (!fig.querySelector('.img-delete-btn')) {
        const delBtn = document.createElement('button');
        delBtn.className = 'img-delete-btn';
        delBtn.innerHTML = 'X';
        delBtn.type = 'button';
        delBtn.onclick = function() { removeImageContainer(this); };
        fig.appendChild(delBtn);
      }
      
      const media = fig.querySelector('.figure-media');
      if (media) {
        media.onclick = function() { triggerImageReplace(this); };
      }
      
      const plc = fig.querySelector('.placeholder-content');
      if (plc) {
        plc.onclick = function() { triggerImageReplace(this); };
      }
    });

    DOM.editorToolbar.style.display = 'flex';
  }
}

async function saveProductData() {
  if (isStandalone) {
    console.log("Standalone mode: saving to localStorage");
    try {
      localStorage.setItem(`prod_edit_${activeProduct.id}`, JSON.stringify(activeProduct));
      
      // Update in memory allProducts array
      const idx = allProducts.findIndex(p => p.id === activeProduct.id);
      if (idx !== -1) {
        allProducts[idx] = { ...activeProduct };
      }
      
      console.log("Saved in memory and localStorage");
    } catch (err) {
      console.error(err);
      alert("로컬 임시 저장 실패: " + err.message);
    }
  } else {
    try {
      const response = await fetch(`/api/products/${activeProduct.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeProduct)
      });
      if (!response.ok) throw new Error("Failed to save product data");
      console.log("Saved successfully");
    } catch (err) {
      console.error(err);
      alert("저장 실패: " + err.message);
    }
  }
}

function execCommand(command, value = null) {
  document.execCommand(command, false, value);
}

function showInsertTableModal() {
  DOM.tableModal.style.display = 'flex';
}

function closeInsertTableModal() {
  DOM.tableModal.style.display = 'none';
}

function insertTable() {
  const rows = parseInt(DOM.tableRows.value);
  const cols = parseInt(DOM.tableCols.value);
  
  if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) {
    alert("올바른 행/열 값을 입력하십시오.");
    return;
  }
  
  let tableHtml = '<div class="table-wrap"><table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0;"><tbody>';
  for (let r = 0; r < rows; r++) {
    tableHtml += '<tr>';
    for (let c = 0; c < cols; c++) {
      if (r === 0) {
        tableHtml += '<th style="border:1px solid #e2e8f0; padding:12px; background:#f8fafc; font-weight:700; color:#0f172a;">항목</th>';
      } else {
        tableHtml += '<td style="border:1px solid #e2e8f0; padding:12px; background:#ffffff;">내용 입력</td>';
      }
    }
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table></div><p><br></p>';
  
  DOM.tableModal.style.display = 'none';
  contentEditableInsertHTML(tableHtml);
}

function triggerImageUpload() {
  document.getElementById('imageUploadInput').click();
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    
    if (isStandalone) {
      const imgHtml = `
        <figure class="figure" contenteditable="false">
          <div class="figure-media"><img src="${base64Data}" /></div>
          <figcaption>업로드 이미지</figcaption>
        </figure><p><br></p>
      `;
      contentEditableInsertHTML(imgHtml);
    } else {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            data: base64Data
          })
        });
        if (!response.ok) throw new Error("Upload failed");
        const resData = await response.json();
        
        const imgHtml = `
          <figure class="figure" contenteditable="false">
            <div class="figure-media"><img src="${resData.url}" /></div>
            <figcaption>${file.name}</figcaption>
          </figure><p><br></p>
        `;
        contentEditableInsertHTML(imgHtml);
      } catch (err) {
        console.error(err);
        alert("이미지 업로드 실패: " + err.message);
      }
    }
  };
  reader.readAsDataURL(file);
}

function contentEditableInsertHTML(html) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    
    if (container.closest('.editable-active')) {
      range.deleteContents();
      const el = document.createElement("div");
      el.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node, lastNode;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      alert("편집할 텍스트 영역 내부를 마우스로 클릭해 주세요!");
    }
  } else {
    alert("편집할 텍스트 영역 내부를 마우스로 클릭해 주세요!");
  }
}

async function buildStandaloneHTML() {
  if (isStandalone) {
    alert("Standalone 모드에서는 이 기능을 사용할 수 없습니다.");
    return;
  }
  
  try {
    DOM.buildBtn.textContent = '📦 빌드 중...';
    DOM.buildBtn.disabled = true;
    
    const response = await fetch('/api/build', { method: 'POST' });
    if (!response.ok) throw new Error("Build failed");
    const result = await response.json();
    
    alert(`✔ 단일 파일 DB가 성공적으로 빌드되었습니다!\n\n경로: c:\\Users\\jch90\\Desktop\\AI 업무개선\\AQARA LIFE DB\\${result.path}\n\n이 파일은 인터넷이나 서버가 꺼진 상태에서도 더블클릭만으로 언제든 조회 및 사용 가능합니다.`);
  } catch (err) {
    console.error(err);
    alert("단일 파일 빌드 중 에러: " + err.message);
  } finally {
    DOM.buildBtn.textContent = '📦 단일 HTML 내보내기';
    DOM.buildBtn.disabled = false;
  }
}

// Attachments Inline Editing & Upload Helpers
let currentUploadAttachmentIndex = null;

window.addAttachmentRow = function() {
  syncAttachmentsFromUI();
  if (!activeProduct.attachments) activeProduct.attachments = [];
  activeProduct.attachments.push({ name: "새 첨부파일", url: "" });
  renderProductDetail();
};

window.removeAttachmentRow = function(index) {
  syncAttachmentsFromUI();
  activeProduct.attachments.splice(index, 1);
  renderProductDetail();
};

window.uploadAttachmentFile = function(index) {
  currentUploadAttachmentIndex = index;
  document.getElementById('attachment-file-uploader').click();
};

window.handleAttachmentFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file || currentUploadAttachmentIndex === null) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    
    if (isStandalone) {
      alert("단일 로컬 파일 모드에서는 직접 파일 업로드가 불가능합니다. 서버 모드에서 업로드하거나 URL을 직접 입력해 주세요.");
    } else {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            data: base64Data
          })
        });
        if (!response.ok) throw new Error("Upload failed");
        const resData = await response.json();
        
        syncAttachmentsFromUI();
        activeProduct.attachments[currentUploadAttachmentIndex].name = file.name;
        activeProduct.attachments[currentUploadAttachmentIndex].url = resData.url;
        renderProductDetail();
      } catch (err) {
        console.error(err);
        alert("업로드 실패: " + err.message);
      }
    }
  };
  reader.readAsDataURL(file);
};

window.syncAttachmentsFromUI = function() {
  const container = document.getElementById('attachments-edit-container');
  if (!container) return;
  
  const rows = container.querySelectorAll('.attachment-edit-row');
  const atts = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('.att-name-input');
    const urlInput = row.querySelector('.att-url-input');
    if (nameInput && urlInput) {
      atts.push({
        name: nameInput.value.trim(),
        url: urlInput.value.trim()
      });
    }
  });
  
  activeProduct.attachments = atts;
};

// 1. 이미지 박스 플레이스홀더 삽입
window.insertImagePlaceholder = function() {
  const placeholderHtml = `
    <figure class="figure image-placeholder" contenteditable="false" style="position: relative;">
      <div class="figure-media placeholder-content" onclick="triggerImageReplace(this)" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 150px; cursor: pointer; border: 2px dashed rgba(2, 132, 199, 0.4); border-radius: 6px; padding: 20px; width: 100%;">
        <svg style="width: 38px; height: 38px; color: var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span style="font-size: 0.9rem; font-weight: 700; color: var(--accent);">클릭하여 사진 추가</span>
      </div>
      <figcaption contenteditable="true" style="text-align: center; padding: 12px; font-size: 13px; color: var(--text-muted);">[그림] 이미지 설명을 입력하세요</figcaption>
      <button class="img-delete-btn" onclick="removeImageContainer(this)" type="button">X</button>
    </figure><p><br></p>
  `;
  contentEditableInsertHTML(placeholderHtml);
};

// 2. 플레이스홀더 또는 기존 이미지 클릭 시 교체용 인풋 실행
window.triggerImageReplace = function(element) {
  // Only trigger replacement in section edit mode
  if (!editingSectionId) return;
  
  // Find parent .figure
  currentReplacingFigure = element.closest('.figure');
  if (currentReplacingFigure) {
    document.getElementById('imageReplaceInput').click();
  }
};

// 3. 사진 교체 업로드 완료 핸들러
window.handleImageReplaceUpload = function(event) {
  const file = event.target.files[0];
  if (!file || !currentReplacingFigure) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    
    if (isStandalone) {
      updateFigureImage(base64Data, file.name);
    } else {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            data: base64Data
          })
        });
        if (!response.ok) throw new Error("Upload failed");
        const resData = await response.json();
        updateFigureImage(resData.url, file.name);
      } catch (err) {
        console.error(err);
        alert("이미지 변경 실패: " + err.message);
      }
    }
    // Reset file input
    event.target.value = '';
  };
  reader.readAsDataURL(file);
};

// 4. Figure 내 이미지 업데이트 로직
function updateFigureImage(imgUrl, filename) {
  if (!currentReplacingFigure) return;
  
  // Clean placeholder class if exists
  currentReplacingFigure.classList.remove('image-placeholder');
  
  // Find or create figure-media
  let mediaDiv = currentReplacingFigure.querySelector('.figure-media');
  if (!mediaDiv) {
    mediaDiv = document.createElement('div');
    mediaDiv.className = 'figure-media';
    currentReplacingFigure.insertBefore(mediaDiv, currentReplacingFigure.firstChild);
  } else {
    // If it was placeholder-content, replace it
    mediaDiv.innerHTML = '';
    mediaDiv.className = 'figure-media';
    mediaDiv.style = ''; // remove any flex styles from placeholder
  }
  
  // Replace inner media with <img>
  mediaDiv.innerHTML = `<img src="${imgUrl}" />`;
  mediaDiv.onclick = function() { triggerImageReplace(this); };
  
  // Optional: update figcaption if default placeholder text
  const figcaption = currentReplacingFigure.querySelector('figcaption');
  if (figcaption && (figcaption.textContent.includes('이미지 설명을 입력하세요') || figcaption.textContent === '')) {
    figcaption.textContent = `[그림] ${filename.split('.')[0]}`;
  }
  
  currentReplacingFigure = null;
}

// 5. 이미지 박스 컨테이너 제거
window.removeImageContainer = function(button) {
  const figure = button.closest('.figure');
  if (figure) {
    if (confirm("정말 이 이미지를 삭제하시겠습니까?")) {
      figure.remove();
    }
  }
};

// 6. 라이트박스 열기
window.openLightbox = function(src) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImage');
  if (modal && img) {
    img.src = src;
    img.classList.remove('zoomed');
    modal.classList.remove('scroll-mode');
    modal.style.display = 'flex';
    setTimeout(() => {
      img.style.transform = 'scale(1)';
    }, 10);
  }
};

// 7. 라이트박스 닫기
window.closeLightbox = function() {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImage');
  if (modal && img) {
    img.style.transform = 'scale(0.95)';
    img.classList.remove('zoomed');
    modal.classList.remove('scroll-mode');
    setTimeout(() => {
      modal.style.display = 'none';
      img.src = '';
    }, 150);
  }
};

window.deployToGithub = async function() {
  if (isStandalone) {
    alert("정적 모드에서는 이 기능을 사용할 수 없습니다.");
    return;
  }
  
  try {
    DOM.deployBtn.textContent = '🌐 업로드 중...';
    DOM.deployBtn.disabled = true;
    
    const response = await fetch('/api/deploy', { method: 'POST' });
    if (!response.ok) throw new Error("배포 요청 실패");
    const result = await response.json();
    
    if (result.success) {
      alert("✔ 깃허브 사이트가 성공적으로 업데이트되었습니다!\n\n반영되기까지 약 1분 정도 소요될 수 있으니 잠시 후 확인해 보세요.");
    } else {
      throw new Error(result.error || "알 수 없는 에러");
    }
  } catch (err) {
    console.error(err);
    alert("업데이트 중 에러가 발생했습니다: " + err.message);
  } finally {
    DOM.deployBtn.textContent = '🌐 깃허브 즉시 배포';
    DOM.deployBtn.disabled = false;
  }
};

window.downloadAsWordDoc = async function() {
  if (!activeProduct) return;
  
  const container = document.getElementById('articleContainer');
  if (!container) return;
  
  // 1. 본문 영역을 그대로 복사
  const clone = container.cloneNode(true);
  
  // 2. 불필요한 편집용 버튼 및 에디터 폼 요소들 제거
  const editBtns = clone.querySelectorAll('.btn-section-edit');
  editBtns.forEach(btn => btn.remove());
  
  const attEditors = clone.querySelectorAll('.attachments-editor-card');
  attEditors.forEach(el => el.remove());
  
  const actionButtons = clone.querySelectorAll('button');
  actionButtons.forEach(btn => btn.remove());
  
  // 3. 이미지 처리: 외부 이미지는 워드에서 보안상 차단되므로, 모든 이미지를 fetch하여 Base64 데이터로 직접 내장시킵니다.
  const imgs = clone.querySelectorAll('img');
  const baseUri = window.location.origin + window.location.pathname.replace('index.html', '');
  
  const imagePromises = Array.from(imgs).map(async (img) => {
    let src = img.getAttribute('src');
    if (!src) return;
    
    // 이미 Base64 데이터인 경우 건너뜀
    if (src.startsWith('data:')) return;
    
    let absoluteUrl = src;
    if (!src.startsWith('http')) {
      if (src.startsWith('/')) src = src.substring(1);
      absoluteUrl = baseUri + src;
    }
    
    try {
      const response = await fetch(absoluteUrl);
      if (!response.ok) throw new Error("Fetch failed");
      const blob = await response.blob();
      
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      img.setAttribute('src', base64Data);
    } catch (e) {
      console.warn("Base64 변환 실패, 절대경로 우회법 사용:", e, absoluteUrl);
      img.setAttribute('src', absoluteUrl);
    }
  });
  
  // 모든 이미지의 변환이 끝날 때까지 대기
  await Promise.all(imagePromises);

  const contentHtml = clone.innerHTML;
  
  // 4. MS Word 표준 HTML 문서 포맷 조립
  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${activeProduct.product_name}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; line-height: 1.6; color: #333333; padding: 20px; }
        .product-title-section { margin-bottom: 25px; border-bottom: 3px double #0284c7; padding-bottom: 12px; }
        .product-category-tag { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 10px; font-weight: bold; font-size: 11px; margin-bottom: 6px; }
        .product-title { font-size: 26px; color: #0284c7; margin: 0; font-weight: 800; }
        .section-card { margin-bottom: 30px; }
        .section-card-header h2 { font-size: 18px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
        h3 { font-size: 14px; color: #334155; margin-top: 12px; margin-bottom: 6px; }
        p { margin-bottom: 8px; font-size: 13px; }
        table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
        table, th, td { border: 1px solid #cbd5e1; }
        th { background-color: #f8fafc; font-weight: bold; text-align: left; padding: 8px; color: #0f172a; }
        td { padding: 8px; vertical-align: top; }
        .figure { margin: 15px 0; text-align: center; }
        .figure-media img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
        figcaption { font-size: 11px; color: #64748b; margin-top: 6px; text-align: center; }
        .product-attachments-container { display: none !important; }
      </style>
    </head>
    <body>
      ${contentHtml}
    </body>
    </html>
  `;
  
  // 한글 깨짐 방지용 UTF-8 BOM(\ufeff) 명시
  const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword;charset=utf-8' });
  const filename = `${activeProduct.product_name}.doc`;
  
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// 동적 본문/첨부파일 통합 긁어모으기 파서 함수
function extractAllProductFiles(product) {
  const files = [];
  const seenUrls = new Set();
  
  if (!product) return files;
  
  // 1. attachments 필드 추가
  if (product.attachments && Array.isArray(product.attachments)) {
    product.attachments.forEach(att => {
      if (att.url && !seenUrls.has(att.url)) {
        seenUrls.add(att.url);
        files.push({
          name: att.name || "사용자 매뉴얼",
          url: att.url,
          productName: product.product_name,
          category: product.category
        });
      }
    });
  }
  
  // 2. HTML 본문 필드 파싱하여 첨부파일 추출
  const fields = [
    product.specifications,
    product.features,
    product.pre_installation,
    product.installation,
    product.qna,
    product.integration?.aqara_home,
    product.integration?.apple_home,
    product.integration?.smartthings,
    product.integration?.others
  ];
  
  const aTagRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  
  fields.forEach(html => {
    if (!html) return;
    aTagRegex.lastIndex = 0; // reset regex state
    let match;
    while ((match = aTagRegex.exec(html)) !== null) {
      const url = match[1];
      let name = match[2].replace(/<[^>]*>/g, '').trim(); // HTML 태그 제거
      
      // 다운로드 텍스트 불필요 가공 제거
      name = name.replace(/다운로드/g, '').trim();
      
      // 다운로드 센터 등록용 파일인지 확장자 및 패턴 검증
      const isFile = url.includes('/files/') || url.includes('/images/') || 
                     /\.(pdf|png|jpg|jpeg|gif|zip|docx|doc|xls|xlsx)$/i.test(url.split('?')[0]);
      
      if (isFile && url !== '#' && !seenUrls.has(url)) {
        seenUrls.add(url);
        
        // 텍스트 이름이 지나치게 길거나 단순 이동링크일 경우 파일명으로 복원
        if (!name || name.length > 50 || name === '바로가기' || name.includes('🔗')) {
          const parts = url.split('/');
          const filename = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
          name = filename || "첨부 파일";
        }
        
        files.push({
          name: name,
          url: url,
          productName: product.product_name,
          category: product.category
        });
      }
    }
  });
  
  return files;
}

// 통합 자료실 (Download Center) 모달 비즈니스 로직
let dlCenterFiles = [];
let activeDlCategory = "전체";

window.openDownloadCenter = function() {
  const modal = document.getElementById('downloadCenterModal');
  if (modal) {
    modal.style.display = 'flex';
    // 전체 제품 데이터에서 파일 추출
    collectAllFiles();
    renderDownloadCenterTabs();
    renderDownloadCenterFiles();
  }
};

window.closeDownloadCenter = function() {
  const modal = document.getElementById('downloadCenterModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

function collectAllFiles() {
  dlCenterFiles = [];
  allProducts.forEach(prod => {
    const files = extractAllProductFiles(prod);
    dlCenterFiles.push(...files);
  });
}

function renderDownloadCenterTabs() {
  const tabsContainer = document.getElementById('dlCategoryTabs');
  if (!tabsContainer) return;

  // 카테고리 고유값 추출
  const categories = ["전체", ...new Set(dlCenterFiles.map(f => f.category.replace(/^\d+_/,'')))].sort();
  
  let html = '';
  categories.forEach(cat => {
    const isActive = activeDlCategory === cat;
    html += `
      <button class="dl-tab-btn ${isActive ? 'active' : ''}" onclick="selectDlCategory('${cat.replace(/'/g, "\\'")}')">
        ${cat}
      </button>
    `;
  });
  tabsContainer.innerHTML = html;
}

window.selectDlCategory = function(cat) {
  activeDlCategory = cat;
  renderDownloadCenterTabs();
  renderDownloadCenterFiles();
};

window.filterDownloadCenterFiles = function() {
  renderDownloadCenterFiles();
};

window.renderDownloadCenterFiles = function() {
  const grid = document.getElementById('dlFilesGrid');
  const stats = document.getElementById('dlStatsSummary');
  const query = document.getElementById('dlSearchInput').value.toLowerCase().trim();
  if (!grid) return;

  // 1. 카테고리 필터링
  let filtered = dlCenterFiles;
  if (activeDlCategory !== "전체") {
    filtered = filtered.filter(f => f.category.replace(/^\d+_/,'') === activeDlCategory);
  }

  // 2. 검색어 필터링
  if (query) {
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(query) || 
      f.productName.toLowerCase().includes(query)
    );
  }

  // 통계 헤더 수치 업데이트
  if (stats) {
    stats.textContent = `총 ${filtered.length}개 첨부자료 제공 중`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="dl-file-empty">조회된 첨부 자료가 없습니다.</div>';
    return;
  }

  // 카드 그리드 렌더링
  let html = '';
  filtered.forEach(file => {
    const catName = file.category.replace(/^\d+_/,'');
    const isPdf = file.url.toLowerCase().includes('.pdf');
    const icon = isPdf ? '📕' : '💾';
    
    html += `
      <div class="dl-file-card">
        <div class="dl-file-info">
          <div class="dl-file-name" title="${file.name}">${file.name}</div>
          <div class="dl-file-meta">
            <span class="cat-label">${catName}</span>
            <span>${file.productName}</span>
          </div>
        </div>
        <a href="${file.url}" target="_blank" class="dl-file-btn">
          ${icon} 다운로드
        </a>
      </div>
    `;
  });
  grid.innerHTML = html;
};
