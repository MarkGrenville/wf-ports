<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { projectsStore } from "$lib/stores/projects.svelte";
  import { liveStatusStore } from "$lib/stores/liveStatus.svelte";
  import { pm2Store } from "$lib/stores/pm2.svelte";
  import { portioDocsStore, usedPortsStore } from "$lib/stores/system.svelte";

  let { children } = $props();

  onMount(() => {
    projectsStore.start();
    liveStatusStore.start();
    pm2Store.start();
    portioDocsStore.start();
    usedPortsStore.start();
    return () => {
      projectsStore.stop();
      liveStatusStore.stop();
      pm2Store.stop();
      portioDocsStore.stop();
      usedPortsStore.stop();
    };
  });
</script>

{@render children()}
