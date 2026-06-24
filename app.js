/**
 * fastpdf Core Module - 하이브리드 로컬 & 백엔드 통신 스택 (가독성 복구 버전)
 */

const AppState = {
    mergeFiles: [],
    convertImages: [],
    singleFile: null,
    officeFile: null, 
    orgFileBuffer: null,
    orgPagesConfig: [],
    // ⚠️ 아래 URL은 본인의 Render/Railway Gotenberg 컨테이너 주소로 나중에 변경해야 합니다.
   GOTENBERG_API_URL = 'https://gotenberg-production-114c.up.railway.app/forms/libreoffice/convert'
};
// 브라우저 기본 드롭다운 이벤트 방지
window.addEventListener('dragover', (e) => e.preventDefault(), false);
window.addEventListener('drop', (e) => e.preventDefault(), false);

// 탭 전환 제어
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById('global-download-zone').classList.add('hidden');
}

// 결과 파일 다운로드 패널 노출
function displayOutput(blobUrl, filename, isCloud = false) {
    const link = document.getElementById('global-download-link');
    const desc = document.getElementById('download-desc');
    link.href = blobUrl;
    link.download = filename;
    
    desc.textContent = isCloud 
        ? "고정밀 클라우드 변환 엔진을 통해 안전하게 변환이 완료되었습니다."
        : "서버 전송 로그 없이 브라우저 단에서 처리가 마쳤습니다.";

    document.getElementById('global-download-zone').classList.remove('hidden');
    document.getElementById('global-download-zone').scrollIntoView({ behavior: 'smooth' });
}

// PDF 합치기 목록 화면 갱신
function updateMergeListView() {
    const ul = document.getElementById('merge-file-list');
    const listZone = document.getElementById('merge-list-zone');
    
    if (AppState.mergeFiles.length === 0) { 
        ul.innerHTML = ''; 
        listZone.classList.add('hidden'); 
        return; 
    }
    
    ul.innerHTML = AppState.mergeFiles.map((file, i) => `
        <li class="p-2 bg-slate-100 rounded-lg border border-slate-200 flex justify-between items-center">
            <span class="font-medium text-slate-700 truncate max-w-[70%]">📄 [${i+1}] ${file.name}</span>
            <button onclick="removeMergeFile(${index})" class="text-xs bg-white text-red-500 border border-red-200 px-2 py-1 rounded-md hover:bg-red-50 cursor-pointer font-bold">✕ 삭제</button>
        </li>
    `).join('');
    listZone.classList.remove('hidden');
}

// PDF 합치기 목록에서 특정 파일 제거
function removeMergeFile(index) {
    AppState.mergeFiles.splice(index, 1);
    updateMergeListView();
    document.getElementById('global-download-zone').classList.add('hidden');
}

// DOM 로드 완료 후 드롭존 이벤트 바인딩 일괄 처리
document.addEventListener("DOMContentLoaded", () => {
    const bindDropZone = (zoneId, inputId, handler) => {
        const el = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        if (!el || !input) return;
        
        el.addEventListener('click', () => input.click());
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('bg-slate-100'); });
        el.addEventListener('dragleave', () => el.classList.remove('bg-slate-100'));
        el.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            el.classList.remove('bg-slate-100'); 
            if (e.dataTransfer.files.length > 0) handler(e.dataTransfer.files); 
        });
        input.addEventListener('change', (e) => { if (e.target.files.length > 0) handler(e.target.files); });
    };

    // 1. PDF 합치기 드롭존
    bindDropZone('merge-drop-zone', 'merge-input', (files) => { 
        AppState.mergeFiles = AppState.mergeFiles.concat(Array.from(files)); 
        updateMergeListView(); 
    });

    // 2. 신규: 오피스(PPT/Excel/Word) 변환 드롭존
    bindDropZone('office-drop-zone', 'office-input', (files) => {
        AppState.officeFile = files[0];
        document.getElementById('office-status').textContent = `🎯 변환 대기: ${files[0].name}`;
        document.getElementById('office-submit-btn').classList.remove('hidden');
    });

    // 3. PDF ➡️ 이미지 변환 드롭존
    bindDropZone('pdf-to-img-drop-zone', 'pdf-to-img-input', (files) => { 
        AppState.singleFile = files[0]; 
        document.getElementById('pdf-to-img-status').textContent = `🎯 선택됨: ${files[0].name}`; 
        document.getElementById('pdf-to-jpg-btn').classList.remove('hidden'); 
        document.getElementById('pdf-to-png-btn').classList.remove('hidden'); 
    });

    // 4. 이미지 ➡️ PDF 변환 드롭존
    bindDropZone('img-to-pdf-drop-zone', 'img-to-pdf-input', (files) => { 
        AppState.convertImages = AppState.convertImages.concat(Array.from(files)); 
        const ul = document.getElementById('img-file-list'); 
        ul.innerHTML = AppState.convertImages.map((f, i) => `<li class="p-1.5 bg-slate-100 rounded border">🖼️ [${i+1}] ${f.name}</li>`).join(''); 
        document.getElementById('img-list-zone').classList.remove('hidden'); 
    });

    // 5. PDF 페이지 레이아웃 편집(삭제/회전) 드롭존
    bindDropZone('org-drop-zone', 'org-input', async (files) => {
        const file = files[0]; 
        document.getElementById('org-status').textContent = `미리보기 생성 중...`; 
        AppState.orgFileBuffer = await file.arrayBuffer();
        
        const pdf = await pdfjsLib.getDocument({ data: AppState.orgFileBuffer.slice(0) }).promise;
        const container = document.getElementById('org-pages-container'); 
        container.innerHTML = ''; 
        AppState.orgPagesConfig = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
            AppState.orgPagesConfig.push({ originalIndex: i - 1, rotateDegrees: 0, isDeleted: false });
            
            const card = document.createElement('div'); 
            card.id = `page-card-${i-1}`; 
            card.className = 'border border-slate-200 rounded-xl p-3 bg-white text-center space-y-3 shadow-xs flex flex-col items-center';
            card.innerHTML = `
                <div class="text-xs font-bold text-slate-400">Page ${i}</div>
                <div class="w-32 h-40 bg-slate-100 rounded overflow-hidden flex items-center justify-center border border-slate-200">
                    <canvas id="page-canvas-${i-1}" class="max-w-full max-h-full transition-transform duration-200"></canvas>
                </div>
                <div class="flex gap-1 w-full justify-center">
                    <button onclick="rotatePageCard(${i-1})" class="text-xs bg-slate-100 px-2 py-1 rounded-md hover:bg-slate-200 cursor-pointer">🔄 회전</button>
                    <button onclick="deletePageCard(${i-1})" class="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-md hover:bg-red-100 cursor-pointer">❌ 삭제</button>
                </div>
            `;
            container.appendChild(card);
            
            const page = await pdf.getPage(i); 
            const viewport = page.getViewport({ scale: 0.4 }); 
            const canvas = document.getElementById(`page-canvas-${i-1}`); 
            const context = canvas.getContext('2d'); 
            canvas.height = viewport.height; 
            canvas.width = viewport.width; 
            await page.render({ canvasContext: context, viewport: viewport }).promise;
        }
        document.getElementById('org-status').textContent = `선택 완료: ${file.name}`; 
        document.getElementById('org-work-zone').classList.remove('hidden');
    });
});

// [기능 1] 클라우드 Gotenberg API 기반 오피스 변환 엔진
async function executeOfficeToPdf() {
    if (!AppState.officeFile) return;
    const btn = document.getElementById('office-submit-btn');
    const status = document.getElementById('office-status');
    
    btn.disabled = true;
    btn.textContent = "⚡ 고정밀 렌더링 서버 엔진 가동 중 (약 5~10초 소요)...";
    status.textContent = "클라우드 엔진이 파워포인트/엑셀 레이아웃 분석 중입니다...";

    try {
        const formData = new FormData();
        formData.append('files', AppState.officeFile);

        const response = await fetch(AppState.GOTENBERG_API_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('변환 엔지니어링 서버 응답 실패');

        const pdfBlob = await response.blob();
        const baseName = AppState.officeFile.name.substring(0, AppState.officeFile.name.lastIndexOf('.'));
        
        displayOutput(URL.createObjectURL(pdfBlob), `${baseName}_converted.pdf`, true);
        status.textContent = "🎉 성공적으로 복구 및 PDF 변환을 완료했습니다!";
    } catch (e) {
        alert("변환 실패: " + e.message + "\n\n(안내: 아직 가상 서버 배포 전이라면 연결이 되지 않습니다.)");
    } finally {
        btn.disabled = false;
        btn.textContent = "고정밀 PDF 변환 프로세스 시작";
    }
}

// [기능 2] 로컬 PDF 합치기
async function executeMerge() { 
    if (AppState.mergeFiles.length < 2) {
        return alert('병합하려면 최소 2개 이상의 PDF 파일이 필요합니다.');
    }
    try { 
        const out = await PDFLib.PDFDocument.create(); 
        for (const f of AppState.mergeFiles) { 
            const doc = await PDFLib.PDFDocument.load(await f.arrayBuffer()); 
            const pages = await out.copyPages(doc, doc.getPageIndices()); 
            pages.forEach(p => out.addPage(p)); 
        } 
        displayOutput(URL.createObjectURL(new Blob([await out.save()], {type:'application/pdf'})), 'fastpdf_merged.pdf'); 
    } catch(e) { 
        alert(e.message); 
    } 
}

// [기능 3] 로컬 PDF ➡️ 이미지 슬라이싱 (.zip)
async function executePdfToImg(mimeType) { 
    if (!AppState.singleFile) return; 
    try { 
        const pdf = await pdfjsLib.getDocument({ data: await AppState.singleFile.arrayBuffer() }).promise; 
        const zip = new JSZip(); 
        for (let i = 1; i <= pdf.numPages; i++) { 
            const page = await pdf.getPage(i); 
            const vp = page.getViewport({ scale: 1.5 }); 
            const canvas = document.createElement('canvas'); 
            canvas.height = vp.height; 
            canvas.width = vp.width; 
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise; 
            await new Promise(r => canvas.toBlob(b => { zip.file(`page_${i}.${mimeType==='image/png'?'png':'jpg'}`, b); r(); }, mimeType)); 
        } 
        displayOutput(URL.createObjectURL(await zip.generateAsync({type:'blob'})), 'fastpdf_images.zip'); 
    } catch(e) { 
        alert(e.message); 
    } 
}

// [기능 4] 로컬 이미지 다중 결합 ➡️ PDF
async function executeImgToPdf() { 
    try { 
        const doc = await PDFLib.PDFDocument.create(); 
        for (const f of AppState.convertImages) { 
            const img = f.type === 'image/png' ? await doc.embedPng(await f.arrayBuffer()) : await doc.embedJpg(await f.arrayBuffer()); 
            const p = doc.addPage([img.width, img.height]); 
            p.drawImage(img, { x:0, y:0, width:img.width, height:img.height }); 
        } 
        displayOutput(URL.createObjectURL(new Blob([await doc.save()], {type:'application/pdf'})), 'fastpdf_composed.pdf'); 
    } catch(e) { 
        alert(e.message); 
    } 
}

// [기능 5] 로컬 PDF 썸네일 회전 조작
function rotatePageCard(idx) { 
    AppState.orgPagesConfig[idx].rotateDegrees = (AppState.orgPagesConfig[idx].rotateDegrees + 90) % 360; 
    const canvas = document.getElementById(`page-canvas-${idx}`); 
    if (canvas) canvas.style.transform = `rotate(${AppState.orgPagesConfig[idx].rotateDegrees}deg)`; 
}

// [기능 5-1] 로컬 PDF 썸네일 삭제 조작
function deletePageCard(idx) { 
    AppState.orgPagesConfig[idx].isDeleted = true; 
    document.getElementById(`page-card-${idx}`).classList.add('opacity-20', 'pointer-events-none', 'bg-slate-100'); 
}

// [기능 5-2] 변경된 조건대로 로컬 새 PDF 빌드
async function executeOrganize() { 
    try { 
        const srcDoc = await PDFLib.PDFDocument.load(AppState.orgFileBuffer); 
        const outDoc = await PDFLib.PDFDocument.create(); 
        for (const config of AppState.orgPagesConfig) { 
            if (config.isDeleted) continue; 
            const [copiedPage] = await outDoc.copyPages(srcDoc, [config.originalIndex]); 
            if (config.rotateDegrees !== 0) copiedPage.setRotation(PDFLib.degrees(config.rotateDegrees)); 
            outDoc.addPage(copiedPage); 
        } 
        displayOutput(URL.createObjectURL(new Blob([await outDoc.save()], {type:'application/pdf'})), 'fastpdf_organized.pdf'); 
    } catch(e) { 
        alert(e.message); 
    } 
}
