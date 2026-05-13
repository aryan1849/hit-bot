// labwork.js - Handles the Labwork Share feature with Cloud Database (Supabase)

// ==========================================
// 🔴 ACTION REQUIRED: ADD YOUR KEYS HERE 🔴
// ==========================================
const SUPABASE_URL = "https://rhpgnmtnapcxwswcmudw.supabase.co";
const SUPABASE_KEY = "sb_publishable_eLx-eRMtaNBOsRlxjm6rAA_9IWHcZOu";
// ==========================================

let supabaseClient = null;
if (window.supabase && SUPABASE_URL !== "YOUR_SUPABASE_URL_HERE") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const DAYS_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function getLabSessions() {
  if (typeof schedules === 'undefined' || schedules.length === 0) {
    return [];
  }

  const userGroup = localStorage.getItem("userGroup");
  
  return schedules
    .filter(session => session.session_type === "lab")
    .filter(session => !userGroup || session.group === userGroup || session.group === "all")
    .sort((a, b) => {
      const dayDiff = DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.start.localeCompare(b.start);
    });
}

async function getImagesForLab(course, day, group) {
  if (!supabaseClient) {
    // Fallback to local storage if keys are not set yet (for demonstration)
    const key = `labwork_images_${course}_${day}_${group}`;
    const data = localStorage.getItem(key);
    if (!data) return [];
    
    // For local fallback, we'll just mock the date
    const parsed = JSON.parse(data);
    return parsed.map(url => ({
      url: url,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }));
  }

  const folder = `${course.toLowerCase()}/${day.toLowerCase()}/${group.toLowerCase()}`;
  const { data, error } = await supabaseClient.storage.from('labwork').list(folder);
  
  const validImages = [];
  const filesToDelete = [];
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  
  data.forEach(file => {
    if (file.name === '.emptyFolderPlaceholder') return;
    
    const fileAge = Date.now() - new Date(file.created_at || 0).getTime();
    if (fileAge > SEVEN_DAYS_MS) {
      filesToDelete.push(`${folder}/${file.name}`);
    } else {
      const { data: publicUrlData } = supabaseClient.storage.from('labwork').getPublicUrl(`${folder}/${file.name}`);
      const dateStr = file.created_at ? new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "Unknown Date";
      
      const parts = file.name.split('_');
      let uploader = "Someone";
      if (parts.length >= 3) {
        try { uploader = decodeURIComponent(parts[1]); } catch(e){}
      }
      
      validImages.push({
        url: publicUrlData.publicUrl,
        date: dateStr,
        uploader: uploader,
        path: `${folder}/${file.name}`,
        created_at: file.created_at
      });
    }
  });

  // Lazy auto-delete expired photos
  if (filesToDelete.length > 0) {
    supabaseClient.storage.from('labwork').remove(filesToDelete)
      .catch(e => console.error("Auto-delete failed. Make sure you have a DELETE policy in Supabase.", e));
  }
  
  return validImages.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

// Utility to calculate exactly which calendar date the next lab occurrence is
function getNextLabDate(dayStr, timeStr) {
  const targetDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(dayStr.toLowerCase());
  const now = new Date();
  const currentDay = now.getDay();
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  let daysUntil = targetDay - currentDay;
  
  // If the lab is today, but the time has already passed, it's next week
  if (daysUntil === 0) {
    if (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() > minutes)) {
      daysUntil = 7;
    }
  } else if (daysUntil < 0) {
    daysUntil += 7;
  }
  
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysUntil);
  return targetDate;
}

async function addImageForLab(course, day, group, userName, file) {
  if (!supabaseClient) {
    alert("Cloud database is not connected. Saving locally for now.\n\nPlease open labwork.js and add your Supabase keys to share images globally.");
    
    // Fallback to local storage
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target.result;
        const key = `labwork_images_${course}_${day}_${group}`;
        const images = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : [];
        images.push(base64String);
        try {
          localStorage.setItem(key, JSON.stringify(images));
          resolve(true);
        } catch (e) {
          alert("Local storage full! Connect cloud database.");
          resolve(false);
        }
      };
      reader.readAsDataURL(file);
    });
  }
  
  const folder = `${course.toLowerCase()}/${day.toLowerCase()}/${group.toLowerCase()}`;
  const ext = file.name.split('.').pop() || 'jpg';
  const safeName = encodeURIComponent(userName.trim());
  const filename = `${folder}/${Date.now()}_${safeName}_${Math.random().toString(36).substring(7)}.${ext}`;
  
  const { error } = await supabaseClient.storage.from('labwork').upload(filename, file);
  
  if (error) {
    console.error("Upload failed", error);
    alert("Failed to upload image. Please check if your Supabase bucket is named 'labwork' and allows public access.");
    return false;
  }
  return true;
}

function formatTimeDisplay(value) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

window.renderLabwork = function() {
  const labworkGrid = document.getElementById("labworkGrid");
  if (!labworkGrid) return;
  
  const labs = getLabSessions();
  
  if (labs.length === 0) {
    labworkGrid.innerHTML = `<p style="color: var(--muted); grid-column: 1 / -1;">No lab sessions found for your group.</p>`;
    return;
  }
  
  labworkGrid.innerHTML = "";
  
  // Display a warning if Supabase is not connected
  if (!supabaseClient) {
    const warning = document.createElement("div");
    warning.style.gridColumn = "1 / -1";
    warning.style.padding = "12px 16px";
    warning.style.backgroundColor = "rgba(243, 201, 106, 0.1)";
    warning.style.border = "1px solid var(--gold)";
    warning.style.borderRadius = "8px";
    warning.style.color = "var(--gold)";
    warning.style.marginBottom = "16px";
    warning.innerHTML = `<strong>Cloud DB Not Connected:</strong> Images will only be saved locally in your browser. To make them visible to everyone, please add your Supabase keys to <code>labwork.js</code>.`;
    labworkGrid.appendChild(warning);
  }
  
  labs.forEach(lab => {
    const card = document.createElement("div");
    card.className = "lab-card";
    
    // Create header
    const header = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = lab.course.toUpperCase() + " Lab";
    
    const targetDate = getNextLabDate(lab.day, lab.start);
    const targetDateStr = targetDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span>${formatTimeDisplay(lab.start)} - ${formatTimeDisplay(lab.end)}</span>
      <span>Room: ${lab.room}</span>
      <div style="margin-top: 8px; color: var(--gold); font-weight: 500; font-size: 0.85rem;">
        📸 Intended for lab on:<br/> ${targetDateStr}
      </div>
      <div style="color: var(--muted); font-size: 0.75rem; margin-top: 2px;">
        Photos auto-delete after 7 days
      </div>
    `;
    
    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);
    
    // Create gallery
    const gallery = document.createElement("div");
    gallery.className = "lab-gallery";
    
    const renderGallery = async () => {
      gallery.innerHTML = "<span style='color: var(--muted); font-size: 0.8rem;'>Loading photos...</span>";
      gallery.style.display = "block";
      
      const images = await getImagesForLab(lab.course, lab.day, lab.group);
      
      gallery.innerHTML = "";
      if (images.length === 0) {
        gallery.style.display = "none";
      } else {
        gallery.style.display = "grid";
        images.forEach(imgData => {
          const wrapper = document.createElement("div");
          wrapper.style.position = "relative";
          wrapper.style.overflow = "hidden";
          wrapper.style.borderRadius = "8px";
          wrapper.style.border = "1px solid var(--line)";
          
          const img = document.createElement("img");
          img.src = imgData.url;
          img.alt = "Labwork";
          img.style.border = "none"; // Remove border from img since wrapper has it
          img.addEventListener("click", () => openImageViewer(imgData));
          
          const dateBadge = document.createElement("div");
          dateBadge.textContent = imgData.date;
          dateBadge.className = "date-badge";
          
          wrapper.appendChild(img);
          wrapper.appendChild(dateBadge);
          gallery.appendChild(wrapper);
        });
      }
    };
    
    // Initial gallery render
    renderGallery();
    card.appendChild(gallery);
    
    // Create upload button
    const uploadWrapper = document.createElement("div");
    uploadWrapper.className = "upload-btn-wrapper";
    
    const uploadBtn = document.createElement("div");
    uploadBtn.className = "upload-btn";
    uploadBtn.textContent = "Upload Photo";
    
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png, image/jpeg, image/jpg, image/webp";
    
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      let userName = localStorage.getItem("userName");
      if (!userName) {
        userName = prompt("Enter your name so others know who uploaded this photo:");
        if (!userName || !userName.trim()) {
           fileInput.value = "";
           return;
        }
        localStorage.setItem("userName", userName.trim());
      }
      
      const confirmUpload = confirm(`Upload this photo as '${userName}' for the lab on ${targetDateStr}?\n\nIt will be visible to everyone in your group and automatically deleted after 7 days.`);
      if (!confirmUpload) {
        fileInput.value = "";
        return;
      }
      
      uploadBtn.textContent = "Uploading...";
      uploadBtn.style.opacity = "0.7";
      
      const success = await addImageForLab(lab.course, lab.day, lab.group, userName, file);
      
      if (success) {
          await renderGallery();
      }
      
      uploadBtn.textContent = "Upload Photo";
      uploadBtn.style.opacity = "1";
      fileInput.value = "";
    });
    
    uploadWrapper.appendChild(uploadBtn);
    uploadWrapper.appendChild(fileInput);
    card.appendChild(uploadWrapper);
    
    labworkGrid.appendChild(card);
  });
};

function openImageViewer(imgData) {
  const modal = document.getElementById("imageViewerModal");
  const imgElement = document.getElementById("viewerImage");
  const downloadBtn = document.getElementById("downloadImageBtn");
  const shareBtn = document.getElementById("shareImageBtn");
  const deleteBtn = document.getElementById("deleteImageBtn");
  const closeBtn = document.getElementById("closeImageViewer");
  const backdrop = modal.querySelector(".image-viewer-backdrop");
  
  if (!modal || !imgElement) return;
  
  // Create or update the date label in the modal
  let dateLabel = document.getElementById("viewerDateLabel");
  if (!dateLabel) {
    dateLabel = document.createElement("div");
    dateLabel.id = "viewerDateLabel";
    dateLabel.style.color = "var(--muted)";
    dateLabel.style.marginTop = "12px";
    dateLabel.style.fontSize = "0.9rem";
    document.querySelector(".image-viewer-actions").insertAdjacentElement('beforebegin', dateLabel);
  }
  dateLabel.textContent = `Uploaded by ${imgData.uploader} on ${imgData.date}`;
  
  imgElement.src = imgData.url;
  modal.classList.remove("hidden");
  
  const closeModal = () => {
    modal.classList.add("hidden");
    imgElement.src = "";
  };
  
  closeBtn.onclick = closeModal;
  backdrop.onclick = closeModal;
  
  const currentUser = localStorage.getItem("userName");
  if (currentUser && currentUser === imgData.uploader && imgData.path) {
    deleteBtn.style.display = "flex";
    deleteBtn.onclick = async () => {
      if (!confirm("Are you sure you want to permanently delete your photo?")) return;
      deleteBtn.style.opacity = "0.7";
      deleteBtn.textContent = "Deleting...";
      
      const { error } = await supabaseClient.storage.from('labwork').remove([imgData.path]);
      
      deleteBtn.style.opacity = "1";
      deleteBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete';
      
      if (error) {
        alert("Failed to delete photo. Check your connection or Supabase DELETE policy.");
      } else {
        closeModal();
        window.renderLabwork(); // Refresh gallery
      }
    };
  } else {
    deleteBtn.style.display = "none";
  }
  
  downloadBtn.onclick = async () => {
    downloadBtn.style.opacity = "0.7";
    downloadBtn.textContent = "Downloading...";
    try {
      const response = await fetch(imgData.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "labwork_" + Date.now() + ".jpg";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      alert("Failed to download image.");
    }
    downloadBtn.style.opacity = "1";
    downloadBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download';
  };
  
  shareBtn.onclick = async () => {
    try {
      const response = await fetch(imgData.url);
      const blob = await response.blob();
      const file = new File([blob], "labwork.jpg", { type: blob.type });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Labwork Photo',
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Labwork Photo',
          url: imgData.url
        });
      } else {
        alert("Sharing is not supported on this device/browser.");
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error("Error sharing:", e);
      }
    }
  };
}
