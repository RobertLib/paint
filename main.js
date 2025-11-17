// Canvas setup
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// Fill with white background
ctx.fillStyle = "white";
ctx.fillRect(0, 0, canvas.width, canvas.height);

// State
let currentTool = "pencil";
let currentColor = "#000000";
let brushSize = 3;
let isDrawing = false;
let startX = 0;
let startY = 0;
let snapshot = null;

// Tool buttons
const toolButtons = document.querySelectorAll(".tool-btn");
toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toolButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.dataset.tool;

    // Update cursor based on tool
    if (currentTool === "fill") {
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = "crosshair";
    }
  });
});

// Color picker
const colorPicker = document.getElementById("colorPicker");
colorPicker.addEventListener("input", (e) => {
  currentColor = e.target.value;
});

// Color presets
const colorPresets = document.querySelectorAll(".color-preset");
colorPresets.forEach((preset) => {
  preset.addEventListener("click", () => {
    currentColor = preset.dataset.color;
    colorPicker.value = currentColor;
  });
});

// Brush size
const brushSizeInput = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
brushSizeInput.addEventListener("input", (e) => {
  brushSize = e.target.value;
  brushSizeValue.textContent = brushSize;
});

// Clear button
document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the entire canvas?")) {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
});

// Save button
document.getElementById("saveBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "my-drawing.png";
  link.href = canvas.toDataURL();
  link.click();
});

// Drawing functions
function startDraw(e) {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  // Save canvas state for shape tools
  if (["line", "rectangle", "circle"].includes(currentTool)) {
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // For pencil and eraser, start drawing immediately
  if (currentTool === "pencil" || currentTool === "eraser") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  }

  // For fill tool
  if (currentTool === "fill") {
    floodFill(Math.floor(startX), Math.floor(startY), currentColor);
    isDrawing = false;
  }
}

function draw(e) {
  if (!isDrawing) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (currentTool === "pencil") {
    ctx.strokeStyle = currentColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (currentTool === "eraser") {
    ctx.strokeStyle = "white";
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (currentTool === "line") {
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = currentColor;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (currentTool === "rectangle") {
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(startX, startY, x - startX, y - startY);
  } else if (currentTool === "circle") {
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = currentColor;
    const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

function stopDraw() {
  isDrawing = false;
  ctx.beginPath();
}

// Flood fill algorithm
function floodFill(x, y, fillColor) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const targetColor = getPixelColor(imageData, x, y);
  const fillColorRgb = hexToRgb(fillColor);

  if (colorsMatch(targetColor, fillColorRgb)) return;

  const stack = [[x, y]];
  const visited = new Set();

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;

    if (visited.has(key)) continue;
    if (cx < 0 || cx >= canvas.width || cy < 0 || cy >= canvas.height) continue;

    const currentColor = getPixelColor(imageData, cx, cy);
    if (!colorsMatch(currentColor, targetColor)) continue;

    visited.add(key);
    setPixelColor(imageData, cx, cy, fillColorRgb);

    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

function getPixelColor(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3],
  };
}

function setPixelColor(imageData, x, y, color) {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = color.r;
  imageData.data[index + 1] = color.g;
  imageData.data[index + 2] = color.b;
  imageData.data[index + 3] = 255;
}

function colorsMatch(c1, c2) {
  return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Event listeners
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseout", stopDraw);

// Touch support for mobile
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent("mousedown", {
    clientX: touch.clientX,
    clientY: touch.clientY,
  });
  canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent("mousemove", {
    clientX: touch.clientX,
    clientY: touch.clientY,
  });
  canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const mouseEvent = new MouseEvent("mouseup", {});
  canvas.dispatchEvent(mouseEvent);
});
