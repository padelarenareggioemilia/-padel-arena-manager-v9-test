window.PAM_V9_CONFIG = {
  supabaseUrl: "https://ggnmpzfuqchcwzgaxxzx.supabase.co",
  supabasePublishableKey: "sb_publishable_JJUF1lt3lob4r0z2UBTOiw_2YUjk18m",
  version: "9.2.0-calendar-clean"
};

/*
 * Carica il nuovo motore calendario DOPO che calendar.html
 * ha definito tutte le proprie funzioni.
 * Nessuna patch del vecchio calendario resta in questo file.
 */
(function(){
  if(!/(^|\/)calendar\.html$/i.test(location.pathname)) return;
  window.addEventListener('load', function(){
    const script=document.createElement('script');
    script.src='calendar-v9-clean.js?v=920clean1';
    script.async=false;
    document.body.appendChild(script);
  });
})();
