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
    return data ? JSON.parse(data) : [];
  }

  const folder = `${course.toLowerCase()}/${day.toLowerCase()}/${group.toLowerCase()}`;
  const { data, error } = await supabaseClient.storage.from('labwork').list(folder);
  
  if (error || !data) {
    console.error("Error fetching images:", error);
    return [];
  }
  
  return data
    .filter(file => file.name !== '.emptyFolderPlaceholder')
    .map(file => {
      const { data: publicUrlData } = supabaseClient.storage.from('labwork').getPublicUrl(`${folder}/${file.name}`);
      return publicUrlData.publicUrl;
    });
}

async function addImageForLab(course, day, group, file) {
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
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
  
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
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span>${lab.day.charAt(0).toUpperCase() + lab.day.slice(1)}</span>
      <span>${formatTimeDisplay(lab.start)} - ${formatTimeDisplay(lab.end)}</span>
      <span>Room: ${lab.room}</span>
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
        images.forEach(imgSrc => {
          const img = document.createElement("img");
          img.src = imgSrc;
          img.alt = "Labwork";
          gallery.appendChild(img);
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
      
      uploadBtn.textContent = "Uploading...";
      uploadBtn.style.opacity = "0.7";
      
      const success = await addImageForLab(lab.course, lab.day, lab.group, file);
      
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
