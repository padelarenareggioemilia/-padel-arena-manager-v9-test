window.PAM_V9_CONFIG = {
  supabaseUrl: "https://ggnmpzfuqchcwzgaxxzx.supabase.co",
  supabasePublishableKey: "sb_publishable_JJUF1lt3lob4r0z2UBTOiw_2YUjk18m",
  version: "9.2.1-diagnostics-conflict-fix"
};

(function(){
  if(/(^|\/)calendar\.html$/i.test(location.pathname)){
    window.addEventListener('load', function(){
      const script=document.createElement('script');
      script.src='calendar-v9-clean.js?v=920clean1';
      script.async=false;
      document.body.appendChild(script);
    });
    return;
  }

  if(/(^|\/)diagnostics\.html$/i.test(location.pathname)){
    window.addEventListener('load', function(){
      const script=document.createElement('script');
      script.src='diagnostics-calendar-fix.js?v=921diag1';
      script.async=false;
      document.body.appendChild(script);
    });
  }
})();
