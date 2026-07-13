export function NavIcon({ icon }: { icon: string }) {
  if (icon === "home") {
    return (
      <svg className="nav-icon--home" viewBox="0 0 38 41" fill="none" aria-hidden="true">
        <g filter="url(#filter-home-nav)">
          <path
            d="M19.6272 3.34153C19.4916 3.20484 19.3303 3.09635 19.1526 3.02231C18.9749 2.94827 18.7843 2.91016 18.5918 2.91016C18.3993 2.91016 18.2087 2.94827 18.0309 3.02231C17.8532 3.09635 17.6919 3.20484 17.5564 3.34153L4.43137 16.4665C4.29469 16.6021 4.18619 16.7634 4.11216 16.9411C4.03812 17.1188 4 17.3094 4 17.5019C4 17.6945 4.03812 17.8851 4.11216 18.0628C4.18619 18.2405 4.29469 18.4018 4.43137 18.5374C4.56764 18.6725 4.72925 18.7795 4.90693 18.852C5.08461 18.9246 5.27486 18.9614 5.46679 18.9603H6.92512V29.1686C6.92512 29.9422 7.23241 30.684 7.77939 31.231C8.32638 31.778 9.06824 32.0853 9.84179 32.0853H27.3418C28.1153 32.0853 28.8572 31.778 29.4042 31.231C29.9512 30.684 30.2585 29.9422 30.2585 29.1686V18.9603H31.7168C32.1036 18.9603 32.4745 18.8066 32.748 18.5331C33.0215 18.2597 33.1751 17.8887 33.1751 17.5019C33.1762 17.31 33.1394 17.1198 33.0669 16.9421C32.9943 16.7644 32.8874 16.6028 32.7522 16.4665L19.6272 3.34153ZM9.84179 29.1686V15.1832L18.5918 6.4332L27.3418 15.1832V29.1686H9.84179Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter id="filter-home-nav" x="-2.9082" y="0" width="43" height="43" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dy="4" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_280_10484" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_280_10484" result="shape" />
          </filter>
        </defs>
      </svg>
    );
  }

  if (icon === "events") {
    return (
      <svg className="nav-icon--events" viewBox="0 0 38 38" fill="none" aria-hidden="true">
        <g filter="url(#filter-events-nav)">
          <path
            d="M7.65625 0C8.26031 0 8.75 0.489689 8.75 1.09375V2.1875H26.25V1.09375C26.25 0.489689 26.7397 0 27.3438 0C27.9478 0 28.4375 0.489689 28.4375 1.09375V2.1875H30.625C33.0412 2.1875 35 4.14625 35 6.5625V30.625C35 33.0412 33.0412 35 30.625 35H4.375C1.95876 35 0 33.0412 0 30.625V6.5625C0 4.14625 1.95875 2.1875 4.375 2.1875H6.5625V1.09375C6.5625 0.489689 7.05219 0 7.65625 0ZM4.375 4.375C3.16688 4.375 2.1875 5.35438 2.1875 6.5625V30.625C2.1875 31.8331 3.16688 32.8125 4.375 32.8125H30.625C31.8331 32.8125 32.8125 31.8331 32.8125 30.625V6.5625C32.8125 5.35438 31.8331 4.375 30.625 4.375H4.375Z"
            fill="currentColor"
          />
          <path
            d="M5.46875 8.75C5.46875 8.14594 5.95844 7.65625 6.5625 7.65625H28.4375C29.0416 7.65625 29.5312 8.14594 29.5312 8.75V10.9375C29.5312 11.5416 29.0416 12.0312 28.4375 12.0312H6.5625C5.95844 12.0312 5.46875 11.5416 5.46875 10.9375V8.75Z"
            fill="currentColor"
          />
          <path
            d="M24.0625 16.4062C24.0625 15.8022 24.5522 15.3125 25.1562 15.3125H27.3438C27.9478 15.3125 28.4375 15.8022 28.4375 16.4062V18.5938C28.4375 19.1978 27.9478 19.6875 27.3438 19.6875H25.1562C24.5522 19.6875 24.0625 19.1978 24.0625 18.5938V16.4062Z"
            fill="currentColor"
          />
          <path
            d="M17.5 16.4062C17.5 15.8022 17.9897 15.3125 18.5938 15.3125H20.7812C21.3853 15.3125 21.875 15.8022 21.875 16.4062V18.5938C21.875 19.1978 21.3853 19.6875 20.7812 19.6875H18.5938C17.9897 19.6875 17.5 19.1978 17.5 18.5938V16.4062Z"
            fill="currentColor"
          />
          <path
            d="M6.5625 22.9688C6.5625 22.3647 7.05219 21.875 7.65625 21.875H9.84375C10.4478 21.875 10.9375 22.3647 10.9375 22.9688V25.1562C10.9375 25.7603 10.4478 26.25 9.84375 26.25H7.65625C7.05219 26.25 6.5625 25.7603 6.5625 25.1562V22.9688Z"
            fill="currentColor"
          />
          <path
            d="M13.125 22.9688C13.125 22.3647 13.6147 21.875 14.2188 21.875H16.4062C17.0103 21.875 17.5 22.3647 17.5 22.9688V25.1562C17.5 25.7603 17.0103 26.25 16.4062 26.25H14.2188C13.6147 26.25 13.125 25.7603 13.125 25.1562V22.9688Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter id="filter-events-nav" x="0" y="0" width="38" height="38" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dx="2" dy="2" />
            <feGaussianBlur stdDeviation="0.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_280_10486" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_280_10486" result="shape" />
          </filter>
        </defs>
      </svg>
    );
  }

  if (icon === "attendance") {
    return (
      <svg className="nav-icon--attendance" viewBox="0 0 38 35" fill="none" aria-hidden="true">
        <g filter="url(#filter-attendance-nav)">
          <path
            d="M32.8125 30.625C32.8125 30.625 35 30.625 35 28.4375C35 26.25 32.8125 19.6875 24.0625 19.6875C15.3125 19.6875 13.125 26.25 13.125 28.4375C13.125 30.625 15.3125 30.625 15.3125 30.625H32.8125ZM15.3614 28.4375C15.3538 28.4366 15.3432 28.4352 15.3303 28.4331C15.3243 28.4321 15.3183 28.431 15.3125 28.4299C15.3157 27.8523 15.6775 26.1776 16.9734 24.6658C18.1854 23.2517 20.3059 21.875 24.0625 21.875C27.8191 21.875 29.9396 23.2517 31.1516 24.6658C32.4475 26.1776 32.8093 27.8523 32.8125 28.4299C32.8067 28.431 32.8007 28.4321 32.7947 28.4331C32.7818 28.4352 32.7712 28.4366 32.7636 28.4375H15.3614Z"
            fill="currentColor"
          />
          <path
            d="M24.0625 15.3125C26.4787 15.3125 28.4375 13.3537 28.4375 10.9375C28.4375 8.52125 26.4787 6.5625 24.0625 6.5625C21.6463 6.5625 19.6875 8.52125 19.6875 10.9375C19.6875 13.3537 21.6463 15.3125 24.0625 15.3125ZM30.625 10.9375C30.625 14.5619 27.6869 17.5 24.0625 17.5C20.4381 17.5 17.5 14.5619 17.5 10.9375C17.5 7.31313 20.4381 4.375 24.0625 4.375C27.6869 4.375 30.625 7.31313 30.625 10.9375Z"
            fill="currentColor"
          />
          <path
            d="M15.1723 20.2999C14.3678 20.0426 13.474 19.8555 12.4825 19.7598C11.9918 19.7125 11.4771 19.6875 10.9375 19.6875C2.1875 19.6875 0 26.25 0 28.4375C0 29.8958 0.729167 30.625 2.1875 30.625H11.4108C11.1028 30.0036 10.9375 29.2669 10.9375 28.4375C10.9375 26.2275 11.7627 23.9707 13.3215 22.0854C13.854 21.4413 14.4722 20.8406 15.1723 20.2999ZM10.7626 21.876C9.45559 23.8735 8.75 26.1509 8.75 28.4375H2.1875C2.1875 27.8672 2.54678 26.1843 3.84837 24.6658C5.0415 23.2738 7.11483 21.918 10.7626 21.876Z"
            fill="currentColor"
          />
          <path
            d="M3.28125 12.0312C3.28125 8.40688 6.21938 5.46875 9.84375 5.46875C13.4681 5.46875 16.4062 8.40688 16.4062 12.0312C16.4062 15.6556 13.4681 18.5938 9.84375 18.5938C6.21938 18.5938 3.28125 15.6556 3.28125 12.0312ZM9.84375 7.65625C7.4275 7.65625 5.46875 9.615 5.46875 12.0312C5.46875 14.4475 7.4275 16.4062 9.84375 16.4062C12.26 16.4062 14.2188 14.4475 14.2188 12.0312C14.2188 9.615 12.26 7.65625 9.84375 7.65625Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter id="filter-attendance-nav" x="0" y="0" width="38" height="38" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dx="2" dy="2" />
            <feGaussianBlur stdDeviation="0.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_280_10487" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_280_10487" result="shape" />
          </filter>
        </defs>
      </svg>
    );
  }

  if (icon === "saved") {
    return (
      <svg className="nav-icon--saved" viewBox="0 0 35 38" fill="none" aria-hidden="true">
        <g filter="url(#filter-saved-nav)">
          <path
            d="M4.375 8.75C4.375 6.33375 6.33375 4.375 8.75 4.375H21.875C24.2912 4.375 26.25 6.33375 26.25 8.75V33.9062C26.25 34.3096 26.028 34.6802 25.6723 34.8706C25.3167 35.0609 24.8852 35.0401 24.5495 34.8163L15.3125 28.6583L6.07545 34.8163C5.73983 35.0401 5.3083 35.0609 4.95266 34.8706C4.59701 34.6802 4.375 34.3096 4.375 33.9062V8.75ZM8.75 6.5625C7.54188 6.5625 6.5625 7.54188 6.5625 8.75V31.8626L14.7058 26.4337C15.0732 26.1888 15.5518 26.1888 15.9192 26.4337L24.0625 31.8626V8.75C24.0625 7.54188 23.0831 6.5625 21.875 6.5625H8.75Z"
            fill="currentColor"
          />
          <path
            d="M9.33533 2.1875H26.25C26.401 2.1875 26.5485 2.2028 26.6909 2.23194C27.6877 2.43592 28.4375 3.31789 28.4375 4.375V30.1166L28.9246 30.4413C29.2602 30.6651 29.6917 30.6859 30.0474 30.4956C30.403 30.3052 30.625 29.9346 30.625 29.5312V4.375C30.625 1.95875 28.6663 0 26.25 0H13.125C11.5057 0 10.0918 0.87981 9.33533 2.1875Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter id="filter-saved-nav" x="0" y="0" width="38" height="38" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dx="2" dy="2" />
            <feGaussianBlur stdDeviation="0.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_280_10488" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_280_10488" result="shape" />
          </filter>
        </defs>
      </svg>
    );
  }

  if (icon === "certificates") {
    return (
      <svg className="nav-icon--certificates" viewBox="0 0 35 38" fill="none" aria-hidden="true">
        <g filter="url(#filter-certificates-nav)">
          <path
            d="M21.1505 1.89064L17.5002 0L13.8499 1.89064L9.78551 2.50665L7.94368 6.18179L5.01758 9.06915L5.68769 13.125L5.01758 17.1808L7.94368 20.0682L9.78551 23.7433L13.8499 24.3594L17.5002 26.25L21.1505 24.3594L25.2149 23.7433L27.0567 20.0682L29.9828 17.1808L29.3127 13.125L29.9828 9.06915L27.0567 6.18179L25.2149 2.50665L21.1505 1.89064ZM23.7669 4.49967L25.263 7.485L27.6399 9.83042L27.0955 13.125L27.6399 16.4196L25.263 18.765L23.7669 21.7503L20.4653 22.2507L17.5002 23.7865L14.5351 22.2507L11.2335 21.7503L9.7374 18.765L7.36051 16.4196L7.90485 13.125L7.36051 9.83042L9.7374 7.485L11.2335 4.49967L14.5351 3.99929L17.5002 2.46351L20.4653 3.99929L23.7669 4.49967Z"
            fill="currentColor"
          />
          <path
            d="M8.75019 25.799V35L17.5002 32.8125L26.2502 35V25.7989L21.8356 26.468L17.5002 28.7135L13.1648 26.468L8.75019 25.799Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter id="filter-certificates-nav" x="0" y="0" width="38" height="38" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dx="2" dy="2" />
            <feGaussianBlur stdDeviation="0.5" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_280_10489" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_280_10489" result="shape" />
          </filter>
        </defs>
      </svg>
    );
  }

  if (icon === "feedback") {
    return (
      <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
