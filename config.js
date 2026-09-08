window.PAM_V9_CONFIG = {
  supabaseUrl: "https://ggnmpzfuqchcwzgaxxzx.supabase.co",
  supabasePublishableKey: "sb_publishable_JJUF1lt3lob4r0z2UBTOiw_2YUjk18m",
  version: "9.9.48-eden-calendar-constraint"
};

(function(){
  function add(src){
    const s=document.createElement('script');
    s.src=src; s.async=false; document.body.appendChild(s);
  }

  if(/(^|\/)calendar\.html$/i.test(location.pathname)){
    window.addEventListener('load', function(){
      add('calendar-v9-eden-loader.js?v=9948');
    });
    return;
  }

  if(/(^|\/)diagnostics\.html$/i.test(location.pathname)){
    window.addEventListener('load', function(){
      add('diagnostics-calendar-fix.js?v=921diag1');
      add('tesseramenti-overview.js?v=9947');
      add('diagnostics-v9947.js?v=9947');
    });
    return;
  }

  if(/(^|\/)index\.html$/i.test(location.pathname) || /\/$/.test(location.pathname)){
    window.addEventListener('load', function(){ add('tesseramenti-overview.js?v=9947'); });
  }
})();
