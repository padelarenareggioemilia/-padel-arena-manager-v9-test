
(function(){
  document.addEventListener('click',function(e){
    if(!e.target.closest('.more-wrap,.export')) document.querySelectorAll('.more-menu,.export-menu').forEach(x=>x.classList.add('hidden'));
  });
  window.addEventListener('load',function(){
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button')});
  });
})();
