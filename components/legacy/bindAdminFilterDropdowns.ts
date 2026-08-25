const COURSES = [
  "BS Accountancy",
  "BS Accounting Information System",
  "BS Psychology",
  "Bachelor of Elementary Education",
  "Bachelor of Secondary Education",
  "BS Information Technology",
  "Bachelor of Multimedia Arts",
  "BA Communication",
  "BS Business Administration",
  "Major in Financial Management",
  "Major in Marketing Management",
  "Major in Human Resource Development Management",
  "Major in Operations Management",
  "BS Tourism Management",
  "BS Hospitality Management",
  "Specialization in Cruiseline Operations",
  "Specialization in Culinary Arts and Kitchen Operations",
  "BS Nursing",
  "BS Physical Therapy",
  "BS Radiologic Technology",
  "BS Pharmacy",
  "BS Medical Laboratory Science (Medical Technology)",
  "BS Biology",
] as const;

const ORG_ITEMS: Array<{ type: "section" | "group" | "option"; label: string }> = [
  { type: "section", label: "ACADEMIC ORGANIZATIONS" },
  { type: "group", label: "SNAHS" },
  { type: "option", label: "BSN - Dominican Nursing Student Council" },
  { type: "option", label: "BSRT - Magnitudinem Quidem" },
  { type: "option", label: "BSPT - REACH Physical Therapy Society" },
  { type: "group", label: "SMLS" },
  { type: "option", label: "BSMLS - Laboratorium Duces" },
  {
    type: "option",
    label: "BSPHARmM - Junior Philippine Pharmacists Association (JPPhA)",
  },
  { type: "option", label: "BSBIO - Bio Core Council" },
  { type: "group", label: "SASE" },
  {
    type: "option",
    label: "BSPSYCH - Sikolohistang Dominicano Psychology Society",
  },
  { type: "option", label: "BSED/BEED - Global Educators Guild" },
  {
    type: "option",
    label: "BSA/BSAIS - Junior Philippine Institute of Accountants (JPIA)",
  },
  { type: "group", label: "SCMCS" },
  { type: "option", label: "BACOMM - Association of Dominican Communicators" },
  { type: "option", label: "BMMA - Red Concepts" },
  { type: "option", label: "BSIT - Domini Xode" },
  { type: "group", label: "SIHTM" },
  { type: "option", label: "BSBA - Young Executives Society" },
  { type: "option", label: "BSTM - Junior Travellers Tourism Council" },
  { type: "option", label: "BSHM - Alliance of Future Dominican Hoteliers" },
  { type: "section", label: "NON-ACADEMIC ORGANIZATIONS" },
  { type: "option", label: "The Gateway Group of Publications" },
  { type: "option", label: "Dominican Dance Company" },
  { type: "option", label: "Dominican Youth Ministry" },
  { type: "option", label: "Combancheros Dominicanos" },
  { type: "option", label: "Circle of Dominican Achievers" },
];

const NESTED_PREFIXES = ["Major in ", "Specialization in "];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const FILTER_DROPDOWN_PAGES: Record<string, string> = {
  feedback47: "fb47",
  cert45: "cert",
  user27: "u27",
};

function isNested(name: string) {
  return NESTED_PREFIXES.some((p) => name.startsWith(p));
}

function formatDate(d: Date) {
  return `${MONTH_SHORT[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
}

function sameDay(a: Date | null, b: Date) {
  return (
    !!a &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function classNames(prefix: string) {
  if (prefix === "cert") {
    return {
      option: "cert-dd-option",
      orgSection: "cert-org-section",
      orgGroup: "cert-org-group",
      orgOption: "cert-org-option",
      calHead: "cert-cal-head",
      calWeek: "cert-cal-weekdays",
      calGrid: "cert-cal-grid",
      wrap: ".cert-dd-wrap",
    };
  }
  if (prefix === "fb47") {
    return {
      option: "fb47-dd-option",
      orgSection: "fb47-org-section",
      orgGroup: "fb47-org-group",
      orgOption: "fb47-org-option",
      calHead: "fb47-cal-head",
      calWeek: "fb47-cal-weekdays",
      calGrid: "fb47-cal-grid",
      wrap: ".fb47-dd-wrap",
    };
  }
  return {
    option: "admin-dd-option",
    orgSection: "admin-org-section",
    orgGroup: "admin-org-group",
    orgOption: "admin-org-option",
    calHead: "admin-cal-head",
    calWeek: "admin-cal-weekdays",
    calGrid: "admin-cal-grid",
    wrap: ".u27-dd-wrap, .admin-dd-wrap",
  };
}

/**
 * Bind Select Date / Organization / Course with cleanup so soft-nav
 * does not stack document listeners that immediately close menus.
 */
export function bindAdminFilterDropdowns(root: ParentNode, prefix: string) {
  const dateBtn = root.querySelector<HTMLElement>(`#${prefix}-date-btn`);
  const dateMenu = root.querySelector<HTMLElement>(`#${prefix}-date-menu`);
  const dateLabel = root.querySelector<HTMLElement>(`#${prefix}-date-label`);
  const orgBtn = root.querySelector<HTMLElement>(`#${prefix}-org-btn`);
  const orgMenu = root.querySelector<HTMLElement>(`#${prefix}-org-menu`);
  const orgLabel = root.querySelector<HTMLElement>(`#${prefix}-org-label`);
  const courseBtn = root.querySelector<HTMLElement>(`#${prefix}-course-btn`);
  const courseMenu = root.querySelector<HTMLElement>(`#${prefix}-course-menu`);
  const courseLabel = root.querySelector<HTMLElement>(`#${prefix}-course-label`);

  if (!dateBtn || !dateMenu || !orgBtn || !orgMenu || !courseBtn || !courseMenu) {
    return () => {};
  }

  const cn = classNames(prefix);
  let selectedCourse = "";
  let selectedOrg = "";
  let selectedDate: Date | null = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  const emitChange = () => {
    window.dispatchEvent(
      new CustomEvent("dc-admin-filter-change", {
        detail: {
          prefix,
          organization: selectedOrg,
          course: selectedCourse,
          date: selectedDate ? selectedDate.toISOString().slice(0, 10) : "",
        },
      }),
    );
  };

  const closeAll = () => {
    dateMenu.hidden = true;
    orgMenu.hidden = true;
    courseMenu.hidden = true;
    dateBtn.setAttribute("aria-expanded", "false");
    orgBtn.setAttribute("aria-expanded", "false");
    courseBtn.setAttribute("aria-expanded", "false");
  };

  const openMenu = (menu: HTMLElement, btn: HTMLElement) => {
    closeAll();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  };

  const renderCourseMenu = () => {
    courseMenu.innerHTML = "";
    COURSES.forEach((name) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `${cn.option}${isNested(name) ? " is-nested" : ""}`;
      opt.setAttribute("role", "option");
      opt.textContent = name;
      opt.title = name;
      if (selectedCourse === name) opt.classList.add("is-active");
      opt.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedCourse = name;
        if (courseLabel) courseLabel.textContent = name;
        courseBtn.setAttribute("aria-label", `Selected course: ${name}`);
        closeAll();
        emitChange();
      });
      courseMenu.appendChild(opt);
    });
  };

  const renderOrgMenu = () => {
    orgMenu.innerHTML = "";
    ORG_ITEMS.forEach((item) => {
      if (item.type === "section") {
        const el = document.createElement("div");
        el.className = cn.orgSection;
        el.textContent = item.label;
        orgMenu.appendChild(el);
        return;
      }
      if (item.type === "group") {
        const el = document.createElement("div");
        el.className = cn.orgGroup;
        el.textContent = item.label;
        orgMenu.appendChild(el);
        return;
      }
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `${cn.option} ${cn.orgOption}`;
      opt.setAttribute("role", "option");
      opt.textContent = item.label;
      opt.title = item.label;
      if (selectedOrg === item.label) opt.classList.add("is-active");
      opt.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedOrg = item.label;
        if (orgLabel) orgLabel.textContent = item.label;
        orgBtn.setAttribute("aria-label", `Selected organization: ${item.label}`);
        closeAll();
        emitChange();
      });
      orgMenu.appendChild(opt);
    });
  };

  const renderDateMenu = () => {
    dateMenu.innerHTML = "";
    const head = document.createElement("div");
    head.className = cn.calHead;
    const prev = document.createElement("button");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous month");
    prev.textContent = "‹";
    prev.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      renderDateMenu();
    });
    const title = document.createElement("span");
    title.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    const next = document.createElement("button");
    next.type = "button";
    next.setAttribute("aria-label", "Next month");
    next.textContent = "›";
    next.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      renderDateMenu();
    });
    head.append(prev, title, next);
    dateMenu.appendChild(head);

    const weekRow = document.createElement("div");
    weekRow.className = cn.calWeek;
    WEEKDAYS.forEach((w) => {
      const s = document.createElement("span");
      s.textContent = w;
      weekRow.appendChild(s);
    });
    dateMenu.appendChild(weekRow);

    const grid = document.createElement("div");
    grid.className = cn.calGrid;
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      let dayNum: number;
      let cellDate: Date;
      let muted = false;
      if (i < startPad) {
        dayNum = prevDays - startPad + i + 1;
        cellDate = new Date(viewYear, viewMonth - 1, dayNum);
        muted = true;
      } else if (i >= startPad + daysInMonth) {
        dayNum = i - (startPad + daysInMonth) + 1;
        cellDate = new Date(viewYear, viewMonth + 1, dayNum);
        muted = true;
      } else {
        dayNum = i - startPad + 1;
        cellDate = new Date(viewYear, viewMonth, dayNum);
      }
      btn.textContent = String(dayNum);
      if (muted) btn.classList.add("is-muted");
      if (sameDay(today, cellDate)) btn.classList.add("is-today");
      if (sameDay(selectedDate, cellDate)) btn.classList.add("is-selected");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedDate = cellDate;
        viewYear = cellDate.getFullYear();
        viewMonth = cellDate.getMonth();
        if (dateLabel) dateLabel.textContent = formatDate(cellDate);
        dateBtn.setAttribute("aria-label", `Selected date: ${formatDate(cellDate)}`);
        closeAll();
        emitChange();
      });
      grid.appendChild(btn);
    }
    dateMenu.appendChild(grid);
  };

  const onDateClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dateMenu.hidden) {
      closeAll();
      return;
    }
    if (selectedDate) {
      viewYear = selectedDate.getFullYear();
      viewMonth = selectedDate.getMonth();
    } else {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
    }
    renderDateMenu();
    openMenu(dateMenu, dateBtn);
  };

  const onOrgClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (!orgMenu.hidden) {
      closeAll();
      return;
    }
    renderOrgMenu();
    openMenu(orgMenu, orgBtn);
  };

  const onCourseClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (!courseMenu.hidden) {
      closeAll();
      return;
    }
    renderCourseMenu();
    openMenu(courseMenu, courseBtn);
  };

  const onDocClick = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t?.closest(cn.wrap)) closeAll();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeAll();
  };

  dateBtn.addEventListener("click", onDateClick);
  orgBtn.addEventListener("click", onOrgClick);
  courseBtn.addEventListener("click", onCourseClick);
  // Use bubble phase; button handlers stopPropagation on open click
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);

  return () => {
    dateBtn.removeEventListener("click", onDateClick);
    orgBtn.removeEventListener("click", onOrgClick);
    courseBtn.removeEventListener("click", onCourseClick);
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onKey);
    closeAll();
  };
}
