import json
import numpy as np

# [!] Replace these mock arrays with the actual arrays from your BdG solver
# Example: If you solved it for Z=0 (Transparent) and Z=1.5
z_values = [0.0, 1.5]
energy_mesh = np.linspace(0.01, 3.0, 60) # 60 data points is plenty for the web

export_data = {}

for z in z_values:
    z_str = f"{z:.2f}"
    export_data[z_str] = []
    
    for e in energy_mesh:
        # [!] Replace this with a call to your actual numerical BdG solver function
        # mock_A, mock_B, mock_G = your_bdg_solver(E=e, Z=z)
        
        # For demonstration, I am using placeholder dummy math:
        mock_A = np.exp(-e) if z == 0 else 0.1
        mock_B = 0.05
        mock_G = 1.9 if z == 0 else 1.0
        
        export_data[z_str].append({
            "E": round(e, 3),
            "A": round(mock_A, 4),
            "B": round(mock_B, 4),
            "G": round(mock_G, 4)
        })

with open("portfolio/assets/bdg_data.json", "w") as f:
    json.dump(export_data, f)
    
print("Successfully exported bdg_data.json!")