export class VisualFamilyLifecycle {
  constructor(name) {
    this.name = name;
    this.created = false;
    this.disposed = false;
    this.updateCount = 0;
    this.resetCount = 0;
    this.activeObjects = 0;
    this.submittedParts = 0;
    this.maxActiveObjects = 0;
    this.droppedObjects = 0;
    this.objectBudget = 0;
  }

  create() {
    if (this.disposed) throw new Error(`${this.name} visual family is disposed`);
    this.created = true;
    return this;
  }

  beginUpdate() {
    if (!this.created || this.disposed) throw new Error(`${this.name} visual family is not active`);
    this.updateCount += 1;
    this.activeObjects = 0;
    this.submittedParts = 0;
    this.droppedObjects = 0;
  }

  countObject(parts = 1) {
    this.activeObjects += 1;
    this.submittedParts += Math.max(0, Number(parts) || 0);
    this.maxActiveObjects = Math.max(this.maxActiveObjects, this.activeObjects);
  }

  countPart(parts = 1) {
    this.submittedParts += Math.max(0, Number(parts) || 0);
  }

  drop(count = 1) {
    this.droppedObjects += Math.max(0, Number(count) || 0);
  }

  reset() {
    if (this.disposed) return;
    this.resetCount += 1;
    this.activeObjects = 0;
    this.submittedParts = 0;
    this.droppedObjects = 0;
  }

  dispose() {
    this.reset();
    this.disposed = true;
    this.created = false;
  }

  getStats() {
    return {
      name: this.name,
      created: this.created,
      disposed: this.disposed,
      updateCount: this.updateCount,
      resetCount: this.resetCount,
      activeObjects: this.activeObjects,
      submittedParts: this.submittedParts,
      maxActiveObjects: this.maxActiveObjects,
      droppedObjects: this.droppedObjects,
      objectBudget: this.objectBudget,
    };
  }
}
