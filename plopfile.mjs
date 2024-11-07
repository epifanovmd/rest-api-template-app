import middlewareGenerator from "./plop-templates/middleware/middleware.plopfile.js";
import moduleGenerator from "./plop-templates/module/module.plopfile.js";

export default plop => {
  middlewareGenerator(plop);
  moduleGenerator(plop);
};
