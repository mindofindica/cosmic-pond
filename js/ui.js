export function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

export function updateThresholdIndicator(value) {
  const indicator = document.getElementById('thresholdIndicator');
  indicator.textContent = `Sensitivity: ${Math.round(value)}`;
  indicator.classList.add('show');

  clearTimeout(indicator.fadeTimeout);
  indicator.fadeTimeout = setTimeout(() => {
    indicator.classList.remove('show');
  }, 2000);
}
