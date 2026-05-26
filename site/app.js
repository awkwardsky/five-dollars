(function () {
  const dataNode = document.getElementById("opportunity-data");
  const searchInput = document.getElementById("opportunity-search");
  const topicFilter = document.getElementById("topic-filter");
  const results = document.getElementById("search-results");
  const count = document.getElementById("search-count");

  if (!dataNode || !searchInput || !topicFilter || !results || !count) {
    return;
  }

  let opportunities = [];
  try {
    opportunities = JSON.parse(dataNode.textContent || "[]");
  } catch {
    return;
  }

  function updateResults() {
    const query = normalize(searchInput.value);
    const topic = topicFilter.value;
    const filtered = opportunities.filter((item) => {
      const matchesTopic = !topic || item.topics.includes(topic);
      const haystack = normalize([
        item.title,
        item.agency,
        item.source,
        item.status,
        item.summary,
        item.topics.join(" "),
      ].join(" "));
      return matchesTopic && (!query || haystack.includes(query));
    });

    count.textContent = filtered.length + " opportunities";
    results.innerHTML = filtered.slice(0, 12).map(renderResult).join("") || '<p class="empty-state">No matches</p>';
  }

  function renderResult(item, index) {
    return '<article class="opportunity search-result">' +
      '<div class="opportunity-rank">' + String(index + 1) + '</div>' +
      '<div class="opportunity-body">' +
      '<div class="opportunity-meta">' +
      '<span>' + escapeHtml(item.source || "Source") + '</span>' +
      '<span>' + escapeHtml(item.status || "Unknown status") + '</span>' +
      '<span>Fit score ' + escapeHtml(String(item.score || 0)) + '</span>' +
      '</div>' +
      '<h3><a href="' + escapeAttribute(item.url) + '">' + escapeHtml(item.title || "Untitled") + '</a></h3>' +
      '<dl>' +
      '<div><dt>Agency</dt><dd>' + escapeHtml(item.agency || "Unknown") + '</dd></div>' +
      '<div><dt>Deadline</dt><dd>' + escapeHtml(item.closeDate || "Not listed") + '</dd></div>' +
      '<div><dt>Amount</dt><dd>' + escapeHtml(item.amount || "Not listed") + '</dd></div>' +
      '</dl>' +
      '<p>' + escapeHtml(item.summary || "No source summary listed.") + '</p>' +
      '</div>' +
      '</article>';
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    const url = String(value || "");
    if (!url || /^\s*javascript:/i.test(url)) {
      return "#";
    }
    return escapeHtml(url);
  }

  searchInput.addEventListener("input", updateResults);
  topicFilter.addEventListener("change", updateResults);
  updateResults();
}());
